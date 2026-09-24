import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import { createNotification } from "./notifications";
import { sendProjectAccessGrantedEmail } from "../lib/mailer";
import * as crypto from "crypto";

/**
 * Grants a real, signed-in `client`-role account visibility into one
 * project (lib/clientScope.ts's ClientProjectAccess resolution). Distinct
 * from client-access.ts's ClientAccessLink: a link is an anonymous,
 * code-redeemed session with no Forge account behind it; this is for a
 * client who actually has an account and signs in normally, which -- before
 * this table existed -- had nowhere in the schema to record which project
 * they belonged to, so every route that scoped by client grant returned
 * nothing for them.
 */
export const clientProjectAccessRouter = Router();

clientProjectAccessRouter.use(tenantAuthMiddleware);
clientProjectAccessRouter.use(denyClientAccess);

async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

// Finds or creates the one "client" channel for this project, and keeps its
// staff side current: every admin (the studio's sole top role since
// migration 0023 folded production_head/producer into it) + lead in the
// tenant, added (never removed here -- a role change shouldn't silently
// evict someone mid-conversation) each time this runs, so a lead hired after
// the channel first existed still ends up reachable. Deliberately never
// includes artist -- see the explicit "production head and the leads...
// not the artists" requirement this was built for. Every client with a
// live ClientProjectAccess grant on this project is a member too.
async function ensureClientProjectChannel(tenantId: string, projectId: string): Promise<string> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    select: { name: true },
  });

  let channel = await prisma.chatChannel.findFirst({
    where: { tenantId, projectId, kind: "client" },
  });
  if (!channel) {
    channel = await prisma.chatChannel.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        kind: "client",
        name: `Client — ${project?.name ?? "Project"}`,
        description: "Direct line to the Production Head and department Leads for this project.",
        projectId,
      },
    });
  }

  const staffRoles = await prisma.tenantRole.findMany({
    where: { tenantId, name: { in: ["admin", "lead"] } },
    select: { id: true },
  });
  const staff = staffRoles.length
    ? await prisma.user.findMany({
        where: { tenantId, roleId: { in: staffRoles.map((r) => r.id) }, status: { not: "inactive" } },
        select: { id: true },
      })
    : [];
  const clients = await prisma.clientProjectAccess.findMany({
    where: { tenantId, projectId },
    select: { userId: true },
  });

  const wantedIds = new Set([...staff.map((s) => s.id), ...clients.map((c) => c.userId)]);
  const existing = await prisma.chatChannelMember.findMany({
    where: { tenantId, channelId: channel.id },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((m) => m.userId));
  const toAdd = [...wantedIds].filter((id) => !existingIds.has(id));

  if (toAdd.length) {
    await prisma.chatChannelMember.createMany({
      data: toAdd.map((userId) => ({
        id: crypto.randomUUID(),
        tenantId,
        channelId: channel!.id,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  return channel.id;
}

function dto(row: {
  id: string;
  userId: string;
  projectId: string;
  grantedByUserId: string;
  createdAt: Date;
  user?: { name: string; email: string } | null;
  project?: { name: string } | null;
}) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name ?? null,
    userEmail: row.user?.email ?? null,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    grantedByUserId: row.grantedByUserId,
    createdAt: row.createdAt,
  };
}

// Gated on approve_reviews, same as ClientAccessLink management -- deciding
// which client sees which project is the same trust level as deciding what
// a client link is scoped to.
clientProjectAccessRouter.get(
  "/",
  requireCapability("approve_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const rows = await prisma.clientProjectAccess.findMany({
        where: { tenantId },
        include: {
          user: { select: { name: true, email: true } },
          project: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json(rows.map(dto));
    } catch (err) {
      req.log.error(err, "Failed to list client project access grants");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

clientProjectAccessRouter.post(
  "/",
  requireCapability("approve_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const { userId, projectId } = req.body;
      if (!userId || !projectId) {
        return res.status(400).json({ error: "userId and projectId are required" });
      }

      const user = await prisma.user.findFirst({
        where: { id: userId, tenantId },
        select: { id: true, role: { select: { name: true } } },
      });
      if (!user) return res.status(400).json({ error: "Invalid userId" });
      if (user.role.name !== "client") {
        return res.status(400).json({ error: "That account isn't a client account" });
      }
      if (!(await projectInTenant(projectId, tenantId))) {
        return res.status(400).json({ error: "Invalid projectId" });
      }

      // Checked before the upsert so the notification below only fires for
      // a genuinely new grant, not every time an admin re-grants access
      // that already existed (the upsert itself treats that as a no-op).
      const alreadyGranted = await prisma.clientProjectAccess.findFirst({
        where: { userId, projectId },
        select: { id: true },
      });

      const created = await prisma.clientProjectAccess.upsert({
        where: { userId_projectId: { userId, projectId } },
        // Already granted: treat re-granting as a no-op success rather than
        // a unique-constraint 500.
        update: {},
        create: {
          id: crypto.randomUUID(),
          tenantId,
          userId,
          projectId,
          grantedByUserId: req.userId!,
        },
        include: {
          user: { select: { name: true, email: true } },
          project: { select: { name: true } },
        },
      });

      // Every grant (new or re-granted) keeps the client project channel's
      // membership current -- covers both "first grant, channel doesn't
      // exist yet" and "channel exists, a new lead joined since."
      await ensureClientProjectChannel(tenantId, projectId);

      // Granting access wrote a row a signed-in client could immediately act
      // on (see every other project-scoped route's clientScope check), but
      // nothing ever told them it existed -- they'd only find out by logging
      // back in and noticing a new project in their own picker.
      let emailSent = false;
      if (!alreadyGranted) {
        await createNotification({
          tenantId,
          recipientUserId: userId,
          category: "workflow",
          title: `You now have access to "${created.project?.name ?? "a project"}"`,
          description: `You can now view and review work on "${created.project?.name ?? "this project"}".`,
          entityType: "project",
          entityId: projectId,
          actionUrl: "/client-review",
        });

        // Non-fatal, same pattern as client-access.ts's "Share with Client"
        // email: the grant itself already succeeded (the row and the in-app
        // notification above are both real), so a missing/misconfigured SMTP
        // setup shouldn't turn a working grant into a 500.
        if (created.user?.email) {
          try {
            const tenant = await prisma.tenant.findUnique({
              where: { id: tenantId },
              select: { name: true },
            });
            await sendProjectAccessGrantedEmail({
              to: created.user.email,
              projectName: created.project?.name ?? "a project",
              tenantName: tenant?.name ?? "Forge",
              loginUrl: `${process.env.FRONTEND_URL || "http://localhost"}/login`,
            });
            emailSent = true;
          } catch (err) {
            req.log.error(err, "Failed to send project access granted email");
          }
        }
      }

      return res.status(201).json({ ...dto(created), emailSent });
    } catch (err) {
      req.log.error(err, "Failed to grant client project access");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

clientProjectAccessRouter.delete(
  "/:id",
  requireCapability("approve_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const grant = await prisma.clientProjectAccess.findFirst({
        where: { id: req.params.id as string, tenantId },
        select: { userId: true, projectId: true },
      });
      if (!grant) return res.status(404).json({ error: "Not found" });

      await prisma.clientProjectAccess.deleteMany({
        where: { id: req.params.id as string, tenantId },
      });

      // Revoking project access should also revoke the ability to message
      // that project's team -- otherwise a removed client keeps a working
      // line into the client channel indefinitely.
      const channel = await prisma.chatChannel.findFirst({
        where: { tenantId, projectId: grant.projectId, kind: "client" },
        select: { id: true },
      });
      if (channel) {
        await prisma.chatChannelMember.deleteMany({
          where: { tenantId, channelId: channel.id, userId: grant.userId },
        });
      }

      return res.status(204).end();
    } catch (err) {
      req.log.error(err, "Failed to revoke client project access");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
