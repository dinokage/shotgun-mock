import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";
import { rateLimitByIp } from "../lib/rateLimit";

// Both delivery routes below are public (external recipients), so they carry
// the same attempt ceiling as the client-access redeem.
const DELIVERY_REDEEM_RULE = { name: "delivery-redeem:ip", limit: 15, windowSeconds: 600 };

export const deliveriesRouter = Router();

// Same alphabet and generator as routes/client-access.ts -- crypto.randomInt,
// no visually ambiguous characters, because a recipient types this by hand
// from an email. Never sequential, never derived from the row's own data.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateAccessCode(length = 10): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// A delivery is only redeemable while it is active, unrevoked, and unexpired
// -- the same three-part contract client-access.ts's /redeem applies to its
// links, expressed once here so the public read and the public download
// record can't drift apart.
function redeemableWhere(code: string) {
  return {
    accessCode: code,
    status: "active",
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

/**
 * The public shape of a delivery. Deliberately hand-built rather than
 * spreading the row: tenantId, projectId, createdById and accessCode itself
 * must never cross to an external recipient, and nothing here reaches beyond
 * this one delivery.
 */
function publicDeliveryDTO(delivery: {
  id: string;
  name: string;
  notes: string;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  project: { name: string; client: string | null } | null;
  createdBy: { name: string } | null;
  items: {
    id: string;
    entityType: string | null;
    entityId: string | null;
    versionId: string | null;
    fileName: string;
    fileSize: string;
    mediaUrl: string;
  }[];
}) {
  return {
    id: delivery.id,
    name: delivery.name,
    notes: delivery.notes,
    status: delivery.status,
    createdAt: delivery.createdAt,
    expiresAt: delivery.expiresAt,
    projectName: delivery.project?.name ?? null,
    clientName: delivery.project?.client ?? null,
    createdByName: delivery.createdBy?.name ?? null,
    items: delivery.items.map((i) => ({
      id: i.id,
      entityType: i.entityType,
      entityId: i.entityId,
      versionId: i.versionId,
      fileName: i.fileName,
      fileSize: i.fileSize,
      mediaUrl: i.mediaUrl,
    })),
  };
}

// Unauthenticated on purpose -- the recipient is external and has no Forge
// account, only the code. Declared before tenantAuthMiddleware below so it is
// matched first and never runs through it (router middleware only applies to
// routes registered after it), exactly as client-access.ts does.
//
// Authorization is the code alone: the delivery id in the URL the recipient
// followed is checked against the code's own delivery, so a valid code can
// only ever open the one package it was minted for. Failures return the same
// generic 401 whether the code is unknown, revoked, expired, or simply for a
// different delivery -- nothing here reveals which tenant, project, or
// delivery ids exist.
deliveriesRouter.post("/redeem", rateLimitByIp(DELIVERY_REDEEM_RULE), async (req, res) => {
  try {
    const { id, code } = req.body;
    if (!code || typeof code !== "string")
      return res.status(400).json({ error: "Missing code" });

    const delivery = await prisma.delivery.findFirst({
      where: redeemableWhere(code),
      include: {
        items: true,
        project: { select: { name: true, client: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (!delivery || (typeof id === "string" && id && delivery.id !== id))
      return res.status(401).json({ error: "Invalid or expired code" });

    return res.json(publicDeliveryDTO(delivery));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Records a real DeliveryDownload row so the internal download count reflects
// what the recipient actually took, not a number a browser kept to itself.
// Re-checks the code on every call -- a revoked delivery stops counting.
deliveriesRouter.post("/redeem/download", rateLimitByIp(DELIVERY_REDEEM_RULE), async (req, res) => {
  try {
    const { code, itemId } = req.body;
    if (!code || typeof code !== "string")
      return res.status(400).json({ error: "Missing code" });

    const delivery = await prisma.delivery.findFirst({
      where: redeemableWhere(code),
      select: { id: true, tenantId: true },
    });
    if (!delivery) return res.status(401).json({ error: "Invalid or expired code" });

    // An item id off the request body proves nothing about which delivery it
    // belongs to -- without this check a recipient could attribute (and, via
    // the internal read below, expose) another delivery's item.
    if (itemId !== undefined && itemId !== null) {
      if (typeof itemId !== "string")
        return res.status(400).json({ error: "Invalid itemId" });
      const item = await prisma.deliveryItem.findFirst({
        where: { id: itemId, deliveryId: delivery.id },
        select: { id: true },
      });
      if (!item) return res.status(400).json({ error: "Invalid itemId" });
    }

    await prisma.deliveryDownload.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: delivery.tenantId,
        deliveryId: delivery.id,
        itemId: typeof itemId === "string" ? itemId : null,
      },
    });

    const downloadCount = await prisma.deliveryDownload.count({
      where: { deliveryId: delivery.id },
    });
    return res.json({ downloadCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Everything below is studio-facing delivery management, not the recipient's
// own redemption -- it needs a real employee session. tenantAuthMiddleware
// alone accepts client-access sessions too, so denyClientAccess closes that
// gap the same way client-access.ts does for its own management routes.
deliveriesRouter.use(tenantAuthMiddleware);
deliveriesRouter.use(denyClientAccess);

const MANAGE_DELIVERIES = "approve_reviews";

async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  return !!row;
}

async function deliveryInTenant(id: string, tenantId: string) {
  const row = await prisma.delivery.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  return !!row;
}

/**
 * Resolves the shot ids a delivery is being built from into item rows. Every
 * id is re-read scoped to the tenant AND the delivery's project -- a shot id
 * off the request body otherwise only proves a row exists somewhere, which is
 * exactly how another tenant's (or another project's) footage would end up in
 * a package handed to an outside client.
 */
async function resolveShotItems(
  shotIds: unknown,
  tenantId: string,
  projectId: string,
) {
  const ids: string[] = Array.isArray(shotIds)
    ? shotIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  if (ids.length === 0) return { items: [] as { entityId: string; fileName: string }[] };

  const shots = await prisma.shot.findMany({
    where: { id: { in: ids }, tenantId, projectId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (shots.length !== new Set(ids).size) return { error: "Invalid shotIds" as const };

  return { items: shots.map((s) => ({ entityId: s.id, fileName: s.name })) };
}

async function createWithUniqueCode(
  data: Omit<Parameters<typeof prisma.delivery.create>[0]["data"], "accessCode">,
) {
  // accessCode carries a unique constraint; a collision is vanishingly
  // unlikely at 10 characters but retrying is cheaper than surfacing a 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.delivery.create({
        data: { ...data, accessCode: generateAccessCode() } as Parameters<
          typeof prisma.delivery.create
        >[0]["data"],
        include: {
          items: true,
          project: { select: { name: true, client: true } },
          createdBy: { select: { name: true } },
        },
      });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
    }
  }
  throw new Error("Could not allocate a unique delivery access code");
}

function internalDeliveryDTO(delivery: {
  id: string;
  tenantId: string;
  projectId: string | null;
  name: string;
  notes: string;
  accessCode: string;
  status: string;
  createdById: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  project?: { name: string; client: string | null } | null;
  createdBy?: { name: string } | null;
  items?: {
    id: string;
    entityType: string | null;
    entityId: string | null;
    versionId: string | null;
    fileName: string;
    fileSize: string;
    mediaUrl: string;
  }[];
  _count?: { downloads: number };
}) {
  return {
    id: delivery.id,
    projectId: delivery.projectId,
    name: delivery.name,
    notes: delivery.notes,
    accessCode: delivery.accessCode,
    status: delivery.status,
    createdById: delivery.createdById,
    createdAt: delivery.createdAt,
    expiresAt: delivery.expiresAt,
    revokedAt: delivery.revokedAt,
    projectName: delivery.project?.name ?? null,
    clientName: delivery.project?.client ?? null,
    createdByName: delivery.createdBy?.name ?? null,
    items: delivery.items ?? [],
    downloadCount: delivery._count?.downloads ?? 0,
  };
}

const DELIVERY_INCLUDE = {
  items: true,
  project: { select: { name: true, client: true } },
  createdBy: { select: { name: true } },
  _count: { select: { downloads: true } },
} as const;

// The internal reads carry the access code, so they're gated the same as the
// writes -- an ordinary tenant member must not be able to enumerate every
// client package's code straight off the API.
deliveriesRouter.get(
  "/",
  requireCapability(MANAGE_DELIVERIES),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const { projectId } = req.query;
      const rows = await prisma.delivery.findMany({
        where: {
          tenantId,
          ...(typeof projectId === "string" ? { projectId } : {}),
        },
        include: DELIVERY_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.json(rows.map(internalDeliveryDTO));
    } catch (err) {
      req.log.error(err, "Failed to list deliveries");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

deliveriesRouter.get(
  "/:id",
  requireCapability(MANAGE_DELIVERIES),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const row = await prisma.delivery.findFirst({
        where: { id: req.params.id as string, tenantId },
        include: DELIVERY_INCLUDE,
      });
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(internalDeliveryDTO(row));
    } catch (err) {
      req.log.error(err, "Failed to fetch delivery");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Gated on approve_reviews for the same reason client-access link creation is:
// packaging finished footage for a client is the step after sign-off, not a
// separate permission tier.
deliveriesRouter.post(
  "/",
  requireCapability(MANAGE_DELIVERIES),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { projectId, name, notes, expiresAt, shotIds } = req.body;

      if (typeof name !== "string" || !name.trim())
        return res.status(400).json({ error: "name is required" });
      if (typeof projectId !== "string" || !projectId)
        return res.status(400).json({ error: "projectId is required" });
      if (!(await projectInTenant(projectId, tenantId)))
        return res.status(400).json({ error: "Invalid projectId" });

      const resolved = await resolveShotItems(shotIds, tenantId, projectId);
      if ("error" in resolved) return res.status(400).json({ error: resolved.error });

      const created = await createWithUniqueCode({
        id: crypto.randomUUID(),
        tenantId,
        projectId,
        name: name.trim(),
        notes: typeof notes === "string" ? notes.trim() : "",
        status: "active",
        createdById: userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        items: {
          create: resolved.items.map((i) => ({
            id: crypto.randomUUID(),
            tenantId,
            entityType: "shot",
            entityId: i.entityId,
            fileName: i.fileName,
          })),
        },
      });

      return res.status(201).json(internalDeliveryDTO(created));
    } catch (err) {
      req.log.error(err, "Failed to create delivery");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

deliveriesRouter.patch(
  "/:id",
  requireCapability(MANAGE_DELIVERIES),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      // Cast needed: combining requireCapability() (typed against the generic,
      // path-agnostic Express Request) with this route's "/:id" typing widens
      // req.params.id for overload resolution (same issue documented in
      // routes/client-access.ts's DELETE /:id).
      const deliveryId = req.params.id as string;
      if (!(await deliveryInTenant(deliveryId, tenantId)))
        return res.status(404).json({ error: "Not found" });

      const { name, notes, expiresAt } = req.body;
      const data: Record<string, unknown> = {};
      if (typeof name === "string" && name.trim()) data.name = name.trim();
      if (typeof notes === "string") data.notes = notes.trim();
      if (expiresAt !== undefined)
        data.expiresAt = expiresAt ? new Date(expiresAt) : null;

      const updated = await prisma.delivery.update({
        where: { id: deliveryId },
        data,
        include: DELIVERY_INCLUDE,
      });
      return res.json(internalDeliveryDTO(updated));
    } catch (err) {
      req.log.error(err, "Failed to update delivery");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Revoking sets both the status and revokedAt: /redeem checks both, so a
// revoked package stops opening the instant this returns, for every recipient
// including one already holding the link.
deliveriesRouter.post(
  "/:id/revoke",
  requireCapability(MANAGE_DELIVERIES),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const deliveryId = req.params.id as string;
      const updated = await prisma.delivery.updateMany({
        where: { id: deliveryId, tenantId },
        data: { status: "revoked", revokedAt: new Date() },
      });
      if (updated.count === 0) return res.status(404).json({ error: "Not found" });

      const row = await prisma.delivery.findFirst({
        where: { id: deliveryId, tenantId },
        include: DELIVERY_INCLUDE,
      });
      return res.json(internalDeliveryDTO(row!));
    } catch (err) {
      req.log.error(err, "Failed to revoke delivery");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

deliveriesRouter.post(
  "/:id/reactivate",
  requireCapability(MANAGE_DELIVERIES),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const deliveryId = req.params.id as string;
      const updated = await prisma.delivery.updateMany({
        where: { id: deliveryId, tenantId },
        data: { status: "active", revokedAt: null },
      });
      if (updated.count === 0) return res.status(404).json({ error: "Not found" });

      const row = await prisma.delivery.findFirst({
        where: { id: deliveryId, tenantId },
        include: DELIVERY_INCLUDE,
      });
      return res.json(internalDeliveryDTO(row!));
    } catch (err) {
      req.log.error(err, "Failed to reactivate delivery");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

deliveriesRouter.post(
  "/:id/items",
  requireCapability(MANAGE_DELIVERIES),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const deliveryId = req.params.id as string;
      const delivery = await prisma.delivery.findFirst({
        where: { id: deliveryId, tenantId },
        select: { id: true, projectId: true },
      });
      if (!delivery) return res.status(404).json({ error: "Not found" });
      if (!delivery.projectId)
        return res.status(400).json({ error: "Delivery has no project" });

      const resolved = await resolveShotItems(
        req.body.shotIds,
        tenantId,
        delivery.projectId,
      );
      if ("error" in resolved) return res.status(400).json({ error: resolved.error });

      await prisma.deliveryItem.createMany({
        data: resolved.items.map((i) => ({
          id: crypto.randomUUID(),
          tenantId,
          deliveryId,
          entityType: "shot",
          entityId: i.entityId,
          fileName: i.fileName,
        })),
      });

      const row = await prisma.delivery.findFirst({
        where: { id: deliveryId, tenantId },
        include: DELIVERY_INCLUDE,
      });
      return res.status(201).json(internalDeliveryDTO(row!));
    } catch (err) {
      req.log.error(err, "Failed to add delivery items");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

deliveriesRouter.delete(
  "/:id/items/:itemId",
  requireCapability(MANAGE_DELIVERIES),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const deliveryId = req.params.id as string;
      const itemId = req.params.itemId as string;
      const deleted = await prisma.deliveryItem.deleteMany({
        where: { id: itemId, deliveryId, tenantId },
      });
      if (deleted.count === 0) return res.status(404).json({ error: "Not found" });
      return res.status(204).send();
    } catch (err) {
      req.log.error(err, "Failed to remove delivery item");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
