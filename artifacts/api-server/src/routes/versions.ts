import { Router } from "express";
import { db } from "@workspace/db";
import { versionsTable, tasksTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

// Confirms taskId actually belongs to the caller's tenant before it's
// allowed to be linked onto a version. A DB foreign key only verifies the
// referenced row exists, not who owns it — without this check, any
// authenticated user could cross-link a version to another tenant's task
// (IDOR). Same pattern as routes/shots.ts.
async function taskInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.id, id), eq(tasksTable.tenantId, tenantId)));
  return !!row;
}

export const versionsRouter = Router();

versionsRouter.use(tenantAuthMiddleware);

versionsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType } = req.query;
    const conditions = [eq(versionsTable.tenantId, tenantId)];
    if (typeof entityId === "string") {
      conditions.push(eq(versionsTable.entityId, entityId));
    }
    if (typeof entityType === "string") {
      conditions.push(eq(versionsTable.entityType, entityType));
    }
    const rows = await db
      .select()
      .from(versionsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

versionsRouter.post("/", requireCapability("submit_reviews"), async (req, res) => {
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

    const newId = crypto.randomUUID();
    await db.insert(versionsTable).values({
      id: newId,
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
    });

    const [created] = await db
      .select()
      .from(versionsTable)
      .where(and(eq(versionsTable.tenantId, tenantId), eq(versionsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PATCHABLE_FIELDS = ["status", "notes", "thumbnail", "mediaUrl"] as const;

versionsRouter.put("/:id", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: requireCapability() + this route's "/:id" typing widens
    // req.params.id to `string | string[]` for overload resolution, even
    // though a plain ":id" segment is always a single string at runtime.
    const versionId = req.params.id as string;

    const [existing] = await db
      .select()
      .from(versionsTable)
      .where(and(eq(versionsTable.tenantId, tenantId), eq(versionsTable.id, versionId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }

    await db
      .update(versionsTable)
      .set(updates)
      .where(and(eq(versionsTable.tenantId, tenantId), eq(versionsTable.id, versionId)));

    const [updated] = await db
      .select()
      .from(versionsTable)
      .where(and(eq(versionsTable.tenantId, tenantId), eq(versionsTable.id, versionId)));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
