import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { recordAuditLog } from "../lib/auditLog";
import { getClientScope } from "../lib/clientScope";
import * as crypto from "crypto";

// Each check confirms a foreign-key id actually belongs to the caller's
// tenant before it's allowed to be linked onto a shot. Without this, any
// authenticated user could pass another tenant's projectId/episodeId/
// sequenceId/assigneeId and it would satisfy the FK constraint (which only
// checks the row exists, not who owns it), silently cross-linking tenants'
// data — the FK constraint alone is not a tenant-isolation boundary.
async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function episodeInTenant(id: string, tenantId: string) {
  const row = await prisma.episode.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function sequenceInTenant(id: string, tenantId: string) {
  const row = await prisma.sequence.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function userInTenant(id: string, tenantId: string) {
  const row = await prisma.user.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

export const shotsRouter = Router();

shotsRouter.use(tenantAuthMiddleware);

shotsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    // A client-access session sees only shots under its granted project
    // (narrowed to one episode, or the one shot behind its granted
    // version, when the link is scoped that tight).
    const clientScope = await getClientScope(req);
    if (req.clientAccessLinkId && !clientScope) return res.json([]);
    const rows = await prisma.shot.findMany({
      where: {
        tenantId,
        ...(typeof projectId === "string" ? { projectId } : {}),
        ...(clientScope
          ? {
              projectId: clientScope.projectId,
              ...(clientScope.episodeId ? { episodeId: clientScope.episodeId } : {}),
              ...(clientScope.shotId ? { id: clientScope.shotId } : {}),
            }
          : {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// create_tasks (not manage_pipeline) -- matches the one real frontend
// caller of bulk shot creation, TracksheetImportDialog.tsx's own
// useCapability("create_tasks") gate, which leads (who lack
// manage_pipeline) legitimately use today. Gating this route with
// manage_pipeline would silently break tracksheet import for every lead.
shotsRouter.post("/", requireCapability("create_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name, episodeId, sequenceId, assigneeId } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(400).json({ error: "Invalid projectId" });
    if (episodeId && !(await episodeInTenant(episodeId, tenantId)))
      return res.status(400).json({ error: "Invalid episodeId" });
    if (sequenceId && !(await sequenceInTenant(sequenceId, tenantId)))
      return res.status(400).json({ error: "Invalid sequenceId" });
    if (assigneeId && !(await userInTenant(assigneeId, tenantId)))
      return res.status(400).json({ error: "Invalid assigneeId" });

    const created = await prisma.shot.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        projectId,
        name,
        episodeId: episodeId || null,
        sequenceId: sequenceId || null,
        assigneeId: assigneeId || null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Whitelisted patchable fields — every column a shot's UI can legitimately
// update in place (status, review states, assignment, notes, version
// pointers). Deliberately excludes id/tenantId/projectId/createdAt.
const PATCHABLE_FIELDS = [
  "name",
  "status",
  "assigneeId",
  "frameRange",
  "duration",
  "complexity",
  "currentVersion",
  "usdVersion",
  "internalReviewStatus",
  "clientReviewStatus",
  "thumbnail",
  "notes",
] as const;

// edit_tasks -- the real frontend caller (tracking.tsx's inline grid "Save
// Changes") has no dedicated gate today, and edit_tasks is the least
// restrictive real capability that still excludes a client-access session
// while covering every internal role (including artists) that legitimately
// edits shot status/notes.
shotsRouter.put("/:id", requireCapability("edit_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: combining requireCapability() (typed against the generic,
    // path-agnostic Express Request) with this route's "/:id" path typing
    // makes TS widen req.params.id to `string | string[]` for overload
    // resolution purposes, even though a plain ":id" segment is always a
    // single string at runtime.
    const shotId = req.params.id as string;

    const existing = await prisma.shot.findFirst({ where: { tenantId, id: shotId } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (
      "assigneeId" in req.body &&
      req.body.assigneeId &&
      !(await userInTenant(req.body.assigneeId, tenantId))
    )
      return res.status(400).json({ error: "Invalid assigneeId" });

    const updates: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) {
        updates[field] = req.body[field];
        before[field] = (existing as Record<string, unknown>)[field];
      }
    }
    updates.updatedAt = new Date();

    await prisma.shot.updateMany({ where: { tenantId, id: shotId }, data: updates });
    const updated = await prisma.shot.findFirstOrThrow({ where: { tenantId, id: shotId } });

    // `updates` always carries `updatedAt`, but `before`/`after` should
    // reflect an actual field change -- skip logging an empty-`before` audit
    // row when the request patched no PATCHABLE_FIELDS at all.
    if (Object.keys(before).length > 0) {
      recordAuditLog({
        tenantId,
        actorUserId: req.userId!,
        action: "update",
        targetEntityType: "shot",
        targetEntityId: shotId,
        before,
        after: updates,
      }).catch((err) => req.log.error(err, "audit log write failed"));
    }

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
