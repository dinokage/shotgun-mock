import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess, requireCapability } from "../middleware/rbac";
import { getClientScope } from "../lib/clientScope";
import * as crypto from "crypto";

const AUDIENCES = ["internal", "internal_and_client"];
const SEVERITIES = ["info", "success", "warning"];

// A projectId off the request body only proves the row exists (FK), not that
// it belongs to the caller's tenant -- without this a producer could scope a
// client-facing broadcast onto another tenant's project.
async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  return !!row;
}

async function isClientRole(roleId: string | undefined, tenantId: string) {
  if (!roleId) return false;
  const role = await prisma.tenantRole.findFirst({
    where: { id: roleId, tenantId },
    select: { name: true },
  });
  return role?.name === "client";
}

const AUTHOR_SELECT = {
  id: true,
  authorId: true,
  text: true,
  audience: true,
  projectId: true,
  severity: true,
  createdAt: true,
  author: { select: { name: true, role: { select: { name: true } } } },
} as const;

type BroadcastRow = {
  id: string;
  authorId: string | null;
  text: string;
  audience: string;
  projectId: string | null;
  severity: string;
  createdAt: Date;
  author: { name: string; role: { name: string } | null } | null;
};

function toDTO(row: BroadcastRow) {
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.author?.name ?? null,
    authorRole: row.author?.role?.name ?? null,
    text: row.text,
    audience: row.audience,
    projectId: row.projectId,
    severity: row.severity,
    createdAt: row.createdAt,
  };
}

// Strips the author identity a client portal has no business seeing -- the
// portal renders these as "from the studio", never as a named employee.
function toClientDTO(row: BroadcastRow) {
  return { ...toDTO(row), authorId: null, authorName: null, authorRole: null };
}

export const broadcastsRouter = Router();

broadcastsRouter.use(tenantAuthMiddleware);

// Deliberately NOT behind denyClientAccess: an 'internal_and_client'
// broadcast is meant to reach the client portal. The client branch below is
// the only path that skips that guard, and it hard-codes both filters that
// make it safe -- audience and project -- rather than deriving either from
// anything the caller sent.
broadcastsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;

    const clientScope = await getClientScope(req);
    // Fails closed: a client-access session whose link no longer resolves
    // gets nothing, never the unscoped internal feed.
    if (req.clientAccessLinkId && !clientScope) return res.json([]);

    if (clientScope) {
      const rows = await prisma.broadcast.findMany({
        where: {
          tenantId,
          audience: "internal_and_client",
          projectId: clientScope.projectId,
        },
        select: AUTHOR_SELECT,
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return res.json(rows.map(toClientDTO));
    }

    // An account whose role is literally "client" holds a normal session with
    // no access link, so clientScope above is null for them -- they still get
    // the client view, narrowed to one project they name explicitly (no
    // projectId means no project to scope to, so nothing is returned).
    if (await isClientRole(req.roleId, tenantId)) {
      if (typeof projectId !== "string" || !projectId) return res.json([]);
      if (!(await projectInTenant(projectId, tenantId))) return res.json([]);
      const rows = await prisma.broadcast.findMany({
        where: { tenantId, audience: "internal_and_client", projectId },
        select: AUTHOR_SELECT,
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return res.json(rows.map(toClientDTO));
    }

    const rows = await prisma.broadcast.findMany({
      where: {
        tenantId,
        ...(typeof projectId === "string" && projectId ? { projectId } : {}),
      },
      select: AUTHOR_SELECT,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json(rows.map(toDTO));
  } catch (err) {
    req.log.error(err, "Failed to fetch broadcasts");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// The author is always the caller -- there is no "post on behalf of" case.
broadcastsRouter.post(
  "/",
  denyClientAccess,
  requireCapability("broadcast_updates"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { text, audience, projectId, severity } = req.body;
      if (typeof text !== "string" || !text.trim())
        return res.status(400).json({ error: "text is required" });

      const resolvedAudience =
        typeof audience === "string" ? audience : "internal";
      if (!AUDIENCES.includes(resolvedAudience))
        return res.status(400).json({ error: "Invalid audience" });

      const resolvedSeverity =
        typeof severity === "string" ? severity : "info";
      if (!SEVERITIES.includes(resolvedSeverity))
        return res.status(400).json({ error: "Invalid severity" });

      // A client-facing broadcast with no project has no client portal to
      // land on, and an unvalidated one could land on another tenant's.
      if (resolvedAudience === "internal_and_client" && !projectId)
        return res
          .status(400)
          .json({ error: "projectId is required for a client-facing broadcast" });
      if (projectId && !(await projectInTenant(projectId, tenantId)))
        return res.status(400).json({ error: "Invalid projectId" });

      const created = await prisma.broadcast.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          authorId: userId,
          text: text.trim(),
          audience: resolvedAudience,
          projectId: projectId || null,
          severity: resolvedSeverity,
        },
        select: AUTHOR_SELECT,
      });
      return res.status(201).json(toDTO(created));
    } catch (err) {
      req.log.error(err, "Failed to post broadcast");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
