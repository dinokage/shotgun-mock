import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { getClientScope, ClientScope } from "../lib/clientScope";
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

// A client-access session may only create a review/annotation on a version
// that falls inside its granted project/episode/version scope -- same
// resolution logic as the GET routes below, factored out since POST / and
// POST /:versionId/annotations both need it before writing.
async function versionInClientScope(
  tenantId: string,
  versionId: string,
  clientScope: ClientScope,
): Promise<boolean> {
  if (clientScope.versionId) return clientScope.versionId === versionId;
  const version = await prisma.version.findFirst({
    where: { id: versionId, tenantId },
    select: { entityId: true, entityType: true },
  });
  if (!version || version.entityType !== "shot") return false;
  const shot = await prisma.shot.findFirst({
    where: {
      id: version.entityId,
      tenantId,
      projectId: clientScope.projectId,
      ...(clientScope.episodeId ? { episodeId: clientScope.episodeId } : {}),
    },
    select: { id: true },
  });
  return !!shot;
}

export const reviewsRouter = Router();
reviewsRouter.use(tenantAuthMiddleware);

reviewsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType, versionId } = req.query;

    // Same client-access scoping as versions.ts's GET / -- a review has no
    // direct project link, only entityId/entityType, so scoping to
    // project/episode goes through the shot ids that fall inside the grant.
    const clientScope = await getClientScope(req);
    if (req.clientAccessLinkId && !clientScope) return res.json([]);

    let clientEntityIdFilter: { in: string[] } | undefined;
    if (clientScope && !clientScope.versionId) {
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

    const rows = await prisma.review.findMany({
      where: {
        tenantId,
        ...(typeof entityId === "string" ? { entityId } : {}),
        ...(typeof entityType === "string" ? { entityType } : {}),
        ...(typeof versionId === "string" ? { versionId } : {}),
        ...(clientScope?.versionId ? { versionId: clientScope.versionId } : {}),
        ...(clientEntityIdFilter ? { entityId: clientEntityIdFilter } : {}),
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
    const { entityId, entityType, versionId, status, comments, frame } = req.body;
    if (!entityId || !entityType || !versionId)
      return res.status(400).json({ error: "Missing entityId, entityType, or versionId" });
    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    // Exactly one of reviewerId/reviewerClientAccessLinkId is set -- a
    // client-access session has no real users row (session payload's
    // userId is always null), so it's attributed by which link it
    // redeemed instead. requireCapability("submit_reviews") above already
    // confirmed the caller (employee or client) holds the capability;
    // this only resolves *which* attribution applies and, for a client,
    // that the version is actually inside its grant.
    let reviewerId: string | null = null;
    let reviewerClientAccessLinkId: string | null = null;
    if (req.clientAccessLinkId) {
      const clientScope = await getClientScope(req);
      if (!clientScope || !(await versionInClientScope(tenantId, versionId, clientScope))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      reviewerClientAccessLinkId = req.clientAccessLinkId;
    } else {
      reviewerId = req.userId!;
    }

    const created = await prisma.review.create({
      data: {
        id: crypto.randomUUID(), tenantId, entityId, entityType, versionId,
        reviewerId, reviewerClientAccessLinkId,
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
    const requestedVersionId = req.params.versionId as string;

    // A client-access session may only read annotations on a version that
    // falls inside its granted project/episode/version scope.
    const clientScope = await getClientScope(req);
    if (req.clientAccessLinkId) {
      if (!clientScope) return res.json([]);
      if (clientScope.versionId) {
        if (clientScope.versionId !== requestedVersionId) return res.json([]);
      } else {
        const version = await prisma.version.findFirst({
          where: { id: requestedVersionId, tenantId },
          select: { entityId: true, entityType: true },
        });
        if (!version || version.entityType !== "shot") return res.json([]);
        const shot = await prisma.shot.findFirst({
          where: {
            id: version.entityId,
            tenantId,
            projectId: clientScope.projectId,
            ...(clientScope.episodeId ? { episodeId: clientScope.episodeId } : {}),
          },
          select: { id: true },
        });
        if (!shot) return res.json([]);
      }
    }

    const rows = await prisma.annotation.findMany({
      where: { tenantId, versionId: requestedVersionId },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.post("/:versionId/annotations", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const versionId = req.params.versionId as string;
    const { frame, type, color, x, y, w, h, points, text, startFrame, endFrame, fontFamily, fontSize, backgroundColor } = req.body;
    if (typeof frame !== "number" || !type || !color)
      return res.status(400).json({ error: "Missing frame, type, or color" });
    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    // Same attribution split as POST / above.
    let createdById: string | null = null;
    let createdByClientAccessLinkId: string | null = null;
    if (req.clientAccessLinkId) {
      const clientScope = await getClientScope(req);
      if (!clientScope || !(await versionInClientScope(tenantId, versionId, clientScope))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      createdByClientAccessLinkId = req.clientAccessLinkId;
    } else {
      createdById = req.userId!;
    }

    const created = await prisma.annotation.create({
      data: {
        id: crypto.randomUUID(), tenantId, versionId, frame, type, color,
        x: x ?? 0, y: y ?? 0, w: w ?? null, h: h ?? null, points: points ?? null,
        text: text ?? null, startFrame: startFrame ?? null, endFrame: endFrame ?? null,
        fontFamily: fontFamily ?? null, fontSize: fontSize ?? null, backgroundColor: backgroundColor ?? null,
        createdById, createdByClientAccessLinkId,
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

// An employee owns an annotation it created (createdById); a client-access
// session owns one created through the same link it redeemed
// (createdByClientAccessLinkId) -- links are code-based, not per-person, so
// any redemption of the same link can edit/delete that link's annotations.
function isAnnotationOwner(
  req: import("express").Request,
  existing: { createdById: string | null; createdByClientAccessLinkId: string | null },
): boolean {
  if (req.clientAccessLinkId) {
    return existing.createdByClientAccessLinkId === req.clientAccessLinkId;
  }
  return !!req.userId && existing.createdById === req.userId;
}

reviewsRouter.put("/annotations/:id", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    const existing = await prisma.annotation.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!isAnnotationOwner(req, existing)) return res.status(403).json({ error: "Forbidden" });

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
    const id = req.params.id as string;
    const existing = await prisma.annotation.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!isAnnotationOwner(req, existing)) return res.status(403).json({ error: "Forbidden" });

    await prisma.annotation.deleteMany({ where: { tenantId, id } });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
