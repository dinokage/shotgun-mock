import { Router } from "express";
import { db } from "@workspace/db";
import { reviewsTable, annotationsTable, versionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

// Confirms versionId actually belongs to the caller's tenant before it's
// allowed to be linked onto a review or annotation. A DB foreign key only
// verifies the referenced row exists, not who owns it — without this
// check, any authenticated user could attach a review/annotation to
// another tenant's version (IDOR). Same pattern as routes/shots.ts.
async function versionInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: versionsTable.id })
    .from(versionsTable)
    .where(and(eq(versionsTable.id, id), eq(versionsTable.tenantId, tenantId)));
  return !!row;
}

export const reviewsRouter = Router();

reviewsRouter.use(tenantAuthMiddleware);

reviewsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType, versionId } = req.query;
    const conditions = [eq(reviewsTable.tenantId, tenantId)];
    if (typeof entityId === "string")
      conditions.push(eq(reviewsTable.entityId, entityId));
    if (typeof entityType === "string")
      conditions.push(eq(reviewsTable.entityType, entityType));
    if (typeof versionId === "string")
      conditions.push(eq(reviewsTable.versionId, versionId));
    const rows = await db
      .select()
      .from(reviewsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { entityId, entityType, versionId, status, comments, frame } = req.body;
    if (!entityId || !entityType || !versionId)
      return res
        .status(400)
        .json({ error: "Missing entityId, entityType, or versionId" });

    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    const newId = crypto.randomUUID();
    await db.insert(reviewsTable).values({
      id: newId,
      tenantId,
      entityId,
      entityType,
      versionId,
      reviewerId: userId,
      status: status || "pending",
      comments: comments || "",
      frame: typeof frame === "number" ? frame : null,
    });

    const [created] = await db
      .select()
      .from(reviewsTable)
      .where(and(eq(reviewsTable.tenantId, tenantId), eq(reviewsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.get("/:versionId/annotations", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { versionId } = req.params;
    const rows = await db
      .select()
      .from(annotationsTable)
      .where(
        and(
          eq(annotationsTable.tenantId, tenantId),
          eq(annotationsTable.versionId, versionId),
        ),
      );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.post("/:versionId/annotations", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { versionId } = req.params;
    const {
      frame,
      type,
      color,
      x,
      y,
      w,
      h,
      points,
      text,
      startFrame,
      endFrame,
      fontFamily,
      fontSize,
      backgroundColor,
    } = req.body;
    if (typeof frame !== "number" || !type || !color)
      return res.status(400).json({ error: "Missing frame, type, or color" });

    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    const newId = crypto.randomUUID();
    await db.insert(annotationsTable).values({
      id: newId,
      tenantId,
      versionId,
      frame,
      type,
      color,
      x: x ?? 0,
      y: y ?? 0,
      w: w ?? null,
      h: h ?? null,
      points: points ?? null,
      text: text ?? null,
      startFrame: startFrame ?? null,
      endFrame: endFrame ?? null,
      fontFamily: fontFamily ?? null,
      fontSize: fontSize ?? null,
      backgroundColor: backgroundColor ?? null,
      createdById: userId,
    });

    const [created] = await db
      .select()
      .from(annotationsTable)
      .where(and(eq(annotationsTable.tenantId, tenantId), eq(annotationsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Whitelisted patchable fields — every column an in-place annotation edit
// (resize handle, canvas drag, or the Properties panel's per-field editors)
// can legitimately update. Deliberately excludes id/tenantId/versionId/
// createdById/createdAt/type — type is structural (rect/pen/arrow/text),
// not something a resize/drag/property edit changes.
const ANNOTATION_PATCHABLE_FIELDS = [
  "frame",
  "color",
  "x",
  "y",
  "w",
  "h",
  "points",
  "text",
  "startFrame",
  "endFrame",
  "fontFamily",
  "fontSize",
  "backgroundColor",
] as const;

reviewsRouter.put("/annotations/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const [existing] = await db
      .select()
      .from(annotationsTable)
      .where(and(eq(annotationsTable.tenantId, tenantId), eq(annotationsTable.id, id)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = {};
    for (const field of ANNOTATION_PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }

    await db
      .update(annotationsTable)
      .set(updates)
      .where(and(eq(annotationsTable.tenantId, tenantId), eq(annotationsTable.id, id)));

    const [updated] = await db
      .select()
      .from(annotationsTable)
      .where(and(eq(annotationsTable.tenantId, tenantId), eq(annotationsTable.id, id)));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.delete("/annotations/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const [existing] = await db
      .select()
      .from(annotationsTable)
      .where(and(eq(annotationsTable.tenantId, tenantId), eq(annotationsTable.id, id)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    await db
      .delete(annotationsTable)
      .where(and(eq(annotationsTable.tenantId, tenantId), eq(annotationsTable.id, id)));
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
