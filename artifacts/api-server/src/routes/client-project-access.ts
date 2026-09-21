import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
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
      return res.status(201).json(dto(created));
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
      const deleted = await prisma.clientProjectAccess.deleteMany({
        where: { id: req.params.id as string, tenantId },
      });
      if (deleted.count === 0) return res.status(404).json({ error: "Not found" });
      return res.status(204).end();
    } catch (err) {
      req.log.error(err, "Failed to revoke client project access");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
