import { Router } from "express";
import { db } from "@workspace/db";
import { shotsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const shotsRouter = Router();

shotsRouter.use(tenantAuthMiddleware);

shotsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    const conditions = [eq(shotsTable.tenantId, tenantId)];
    if (typeof projectId === "string") {
      conditions.push(eq(shotsTable.projectId, projectId));
    }
    const rows = await db
      .select()
      .from(shotsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

shotsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name, episodeId, sequenceId, assigneeId } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    const newId = crypto.randomUUID();
    await db.insert(shotsTable).values({
      id: newId,
      tenantId,
      projectId,
      name,
      episodeId: episodeId || null,
      sequenceId: sequenceId || null,
      assigneeId: assigneeId || null,
    });

    const [created] = await db
      .select()
      .from(shotsTable)
      .where(and(eq(shotsTable.tenantId, tenantId), eq(shotsTable.id, newId)));
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

shotsRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const shotId = req.params.id;

    const [existing] = await db
      .select()
      .from(shotsTable)
      .where(and(eq(shotsTable.tenantId, tenantId), eq(shotsTable.id, shotId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    updates.updatedAt = new Date();

    await db.update(shotsTable).set(updates).where(eq(shotsTable.id, shotId));

    const [updated] = await db
      .select()
      .from(shotsTable)
      .where(eq(shotsTable.id, shotId));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
