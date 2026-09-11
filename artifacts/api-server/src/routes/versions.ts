import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import { getClientScope } from "../lib/clientScope";
import {
  getVisibilityScope,
  entityRefScopeWhere,
  canSeeEntity,
} from "../lib/visibilityScope";
import * as crypto from "crypto";

// Confirms taskId actually belongs to the caller's tenant before it's
// allowed to be linked onto a version. A DB foreign key only verifies the
// referenced row exists, not who owns it — without this check, any
// authenticated user could cross-link a version to another tenant's task
// (IDOR). Same pattern as routes/shots.ts.
async function taskInTenant(id: string, tenantId: string) {
  const row = await prisma.task.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

export const versionsRouter = Router();

versionsRouter.use(tenantAuthMiddleware);

versionsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType } = req.query;

    // A client-access session sees only versions belonging to a shot inside
    // its granted project/episode -- or, when the link is scoped to one
    // exact version, only that version. Versions have no direct project
    // link (only entityId/entityType), so scoping to project/episode goes
    // through the shot ids that fall inside the grant.
    const clientScope = await getClientScope(req);
    if (req.clientAccessLinkId && !clientScope) return res.json([]);

    let clientEntityIdFilter: { in: string[] } | undefined;
    if (clientScope) {
      if (clientScope.versionId) {
        // Scoped to one exact version -- filter by id, not entityId.
      } else {
        const shots = await prisma.shot.findMany({
          where: {
            tenantId,
            projectId: clientScope.projectId,
            ...(clientScope.episodeId ? { episodeId: clientScope.episodeId } : {}),
          },
          select: { id: true },
        });
        clientEntityIdFilter = { in: shots.map((s) => s.id) };
      }
    }

    // An employee session is additionally narrowed to versions of the
    // shots/assets their role may see -- a version's media, notes and status
    // are as sensitive as the shot they hang off, and this list was
    // tenant-wide for every role. Skipped for a client-access session, which
    // is already bounded by clientScope above and has no employee role.
    const employeeScopeWhere = req.clientAccessLinkId
      ? null
      : await entityRefScopeWhere(tenantId, await getVisibilityScope(req));

    const rows = await prisma.version.findMany({
      where: {
        tenantId,
        ...(typeof entityId === "string" ? { entityId } : {}),
        ...(typeof entityType === "string" ? { entityType } : {}),
        ...(clientScope?.versionId ? { id: clientScope.versionId } : {}),
        ...(clientEntityIdFilter ? { entityId: clientEntityIdFilter } : {}),
        ...(employeeScopeWhere ?? {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// denyClientAccess first: creating a version row is an internal "footage
// uploaded" action, not feedback -- once submit_reviews is granted to the
// client role (for leaving reviews/annotations below), this route would
// otherwise become reachable by any client-access session too.
versionsRouter.post("/", denyClientAccess, requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { entityId, entityType, versionNumber, mediaUrl, taskId } = req.body;
    if (!entityId || !entityType)
      return res
        .status(400)
        .json({ error: "Missing entityId or entityType" });

    if (taskId && !(await taskInTenant(taskId, tenantId)))
      return res.status(400).json({ error: "Invalid taskId" });

    const created = await prisma.version.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        entityId,
        entityType,
        versionNumber: versionNumber || "v001",
        // A version can (and, for a fresh task, always does) exist before any
        // footage has been uploaded -- the Review page creates one as soon as
        // it opens so annotations/comments/approval-events have somewhere to
        // attach, then PUTs the real mediaUrl once the artist inserts video.
        // Requiring mediaUrl here made that first, footage-less version
        // impossible to create at all (this POST 400'd every time), which
        // silently broke the whole "import video after finishing the task"
        // flow before it could start.
        mediaUrl: mediaUrl || "",
        taskId: taskId || null,
        createdById: userId,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PATCHABLE_FIELDS = ["status", "notes", "thumbnail", "mediaUrl"] as const;

// denyClientAccess first, same reasoning as POST / above -- a client's
// feedback goes through reviews/annotations, not by editing the version
// record's own status/notes/mediaUrl/thumbnail directly.
versionsRouter.put("/:id", denyClientAccess, requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: requireCapability() + this route's "/:id" typing widens
    // req.params.id to `string | string[]` for overload resolution, even
    // though a plain ":id" segment is always a single string at runtime.
    const versionId = req.params.id as string;

    const existing = await prisma.version.findFirst({ where: { tenantId, id: versionId } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    // submit_reviews says what you may change, not which versions. Without
    // this an artist could rewrite the status, notes or mediaUrl of any
    // version in the tenant -- including client-facing review media.
    if (
      !(await canSeeEntity(
        tenantId,
        await getVisibilityScope(req),
        existing.entityType === "asset" ? "asset" : "shot",
        existing.entityId,
      ))
    )
      return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }

    await prisma.version.updateMany({ where: { tenantId, id: versionId }, data: updates });
    const updated = await prisma.version.findFirstOrThrow({ where: { tenantId, id: versionId } });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
