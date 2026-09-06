import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

// Confirms versionId actually belongs to the caller's tenant before it's
// allowed to be linked onto a review or annotation. A DB foreign key only
// verifies the referenced row exists, not who owns it — without this
// check, any authenticated user could attach a review/annotation to
// another tenant's version (IDOR). Same pattern as routes/shots.ts.
async function versionInTenant(id: string, tenantId: string) {
  const row = await prisma.version.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

export const reviewsRouter = Router();
reviewsRouter.use(tenantAuthMiddleware);

reviewsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType, versionId } = req.query;
    const rows = await prisma.review.findMany({
      where: {
        tenantId,
        ...(typeof entityId === "string" ? { entityId } : {}),
        ...(typeof entityType === "string" ? { entityType } : {}),
        ...(typeof versionId === "string" ? { versionId } : {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.post("/", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { entityId, entityType, versionId, status, comments, frame } = req.body;
    if (!entityId || !entityType || !versionId)
      return res.status(400).json({ error: "Missing entityId, entityType, or versionId" });
    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    const created = await prisma.review.create({
      data: {
        id: crypto.randomUUID(), tenantId, entityId, entityType, versionId, reviewerId: userId,
        status: status || "pending", comments: comments || "", frame: typeof frame === "number" ? frame : null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.get("/:versionId/annotations", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await prisma.annotation.findMany({
      where: { tenantId, versionId: req.params.versionId },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.post("/:versionId/annotations", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const versionId = req.params.versionId as string;
    const { frame, type, color, x, y, w, h, points, text, startFrame, endFrame, fontFamily, fontSize, backgroundColor } = req.body;
    if (typeof frame !== "number" || !type || !color)
      return res.status(400).json({ error: "Missing frame, type, or color" });
    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    const created = await prisma.annotation.create({
      data: {
        id: crypto.randomUUID(), tenantId, versionId, frame, type, color,
        x: x ?? 0, y: y ?? 0, w: w ?? null, h: h ?? null, points: points ?? null,
        text: text ?? null, startFrame: startFrame ?? null, endFrame: endFrame ?? null,
        fontFamily: fontFamily ?? null, fontSize: fontSize ?? null, backgroundColor: backgroundColor ?? null,
        createdById: userId,
      },
    });
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
  "frame", "color", "x", "y", "w", "h", "points", "text",
  "startFrame", "endFrame", "fontFamily", "fontSize", "backgroundColor",
] as const;

reviewsRouter.put("/annotations/:id", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    const id = req.params.id as string;
    const existing = await prisma.annotation.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!userId || existing.createdById !== userId) return res.status(403).json({ error: "Forbidden" });

    const updates: Record<string, unknown> = {};
    for (const field of ANNOTATION_PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    await prisma.annotation.updateMany({ where: { tenantId, id }, data: updates });
    const updated = await prisma.annotation.findFirstOrThrow({ where: { tenantId, id } });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.delete("/annotations/:id", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    const id = req.params.id as string;
    const existing = await prisma.annotation.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!userId || existing.createdById !== userId) return res.status(403).json({ error: "Forbidden" });

    await prisma.annotation.deleteMany({ where: { tenantId, id } });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
