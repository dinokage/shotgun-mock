import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import { recordAuditLog } from "../lib/auditLog";
import * as crypto from "crypto";

export const auditRollbacksRouter = Router();

auditRollbacksRouter.use(tenantAuthMiddleware);
// Rollback bookkeeping is part of the audit trail, which is strictly
// internal (same rule as routes/audit-logs.ts).
auditRollbacksRouter.use(denyClientAccess);

const ENTITY_TYPES = ["asset", "shot"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

// Audit metadata is free-form JSON, so a patch derived from it must never
// reach the entity unfiltered -- an old or hand-written row could name
// `tenantId` or `projectId` as a "changed field". These mirror the
// PATCHABLE_FIELDS whitelists that routes/assets.ts and routes/shots.ts
// already enforce on their own PUT handlers.
const ROLLBACK_FIELDS: Record<EntityType, ReadonlySet<string>> = {
  asset: new Set([
    "name",
    "type",
    "status",
    "assigneeId",
    "version",
    "usdVersion",
    "tags",
    "thumbnail",
    "fileSize",
    "polyCount",
    "dependencies",
    "publishStatus",
    "description",
    "notes",
  ]),
  shot: new Set([
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
  ]),
};

function filterFields(entityType: EntityType, values: Record<string, unknown>) {
  const allowed = ROLLBACK_FIELDS[entityType];
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values)) {
    if (allowed.has(field)) out[field] = value;
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function loadEntity(entityType: EntityType, id: string, tenantId: string) {
  return entityType === "asset"
    ? await prisma.asset.findFirst({ where: { id, tenantId } })
    : await prisma.shot.findFirst({ where: { id, tenantId } });
}

async function writeFields(
  entityType: EntityType,
  id: string,
  tenantId: string,
  patch: Record<string, unknown>,
) {
  const data = { ...patch, updatedAt: new Date() };
  if (entityType === "asset") {
    await prisma.asset.updateMany({ where: { id, tenantId }, data });
  } else {
    await prisma.shot.updateMany({ where: { id, tenantId }, data });
  }
}

function pick(entity: Record<string, unknown>, fields: string[]) {
  const values: Record<string, unknown> = {};
  for (const field of fields) values[field] = entity[field] ?? null;
  return values;
}

/**
 * Walks every audit-log row for this entity newer than `rolledBackTo` and
 * builds the field patch that restores it to its state right before the
 * earliest of those rows happened. Iterating newest-first and letting each
 * field keep getting overwritten means the last write — from the oldest
 * qualifying row — is the correct pre-rollback value.
 */
function computeRollbackPatch(
  rolledBackTo: Date,
  logs: { createdAt: Date; metadata: unknown }[],
) {
  const patch: Record<string, unknown> = {};
  for (const event of logs) {
    if (event.createdAt <= rolledBackTo) continue;
    for (const [field, value] of Object.entries(asRecord(asRecord(event.metadata).before))) {
      patch[field] = value;
    }
  }
  return patch;
}

type RollbackRow = {
  entityType: string;
  entityId: string;
  rolledBackTo: Date;
  snapshot: unknown;
  createdById: string | null;
  createdAt: Date;
};

function toDTO(row: RollbackRow) {
  return {
    entityType: row.entityType,
    entityId: row.entityId,
    rolledBackTo: row.rolledBackTo.toISOString(),
    snapshot: asRecord(row.snapshot),
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseEntityType(value: unknown): EntityType | null {
  return ENTITY_TYPES.includes(value as EntityType) ? (value as EntityType) : null;
}

// `entityType` is optional here: the Time Travel page knows an entity's id
// before it knows its kind (which it reads off the entity's audit rows), and
// an id is unique across both tables anyway.
auditRollbacksRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType } = req.query;
    if (typeof entityId !== "string" || !entityId)
      return res.status(400).json({ error: "entityId is required" });
    if (entityType !== undefined && !parseEntityType(entityType))
      return res.status(400).json({ error: `entityType must be one of: ${ENTITY_TYPES.join(", ")}` });

    const row = await prisma.auditRollback.findFirst({
      where: {
        tenantId,
        entityId,
        ...(typeof entityType === "string" ? { entityType } : {}),
      },
    });
    return res.json(row ? toDTO(row) : null);
  } catch (err) {
    req.log.error(err, "Failed to fetch audit rollback");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// manage_pipeline: rolling a shot or asset back rewrites its live production
// fields and discards everything done since, so it sits with the other
// production-restructuring writes (producer / production_head) rather than
// with the per-artist edit capabilities. Note admin and lead can open the
// Time Travel page (LeadershipGuard) but hold no manage_pipeline grant, so
// for them the page is read-only — the UI hides the write controls to match.
auditRollbacksRouter.post("/", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, rolledBackTo } = req.body ?? {};
    const entityType = parseEntityType(req.body?.entityType);

    if (!entityType)
      return res.status(400).json({ error: `entityType must be one of: ${ENTITY_TYPES.join(", ")}` });
    if (typeof entityId !== "string" || !entityId)
      return res.status(400).json({ error: "entityId is required" });
    const target = new Date(rolledBackTo);
    if (typeof rolledBackTo !== "string" || Number.isNaN(target.getTime()))
      return res.status(400).json({ error: "rolledBackTo must be an ISO timestamp" });

    const entity = await loadEntity(entityType, entityId, tenantId);
    if (!entity) return res.status(404).json({ error: "Entity not found" });
    let current = entity as unknown as Record<string, unknown>;

    const existing = await prisma.auditRollback.findUnique({
      where: { tenantId_entityType_entityId: { tenantId, entityType, entityId } },
    });
    const existingSnapshot = filterFields(entityType, asRecord(existing?.snapshot));

    // If this entity is already mid-rollback, its live fields hold an
    // *intermediate* rolled-back state, not the true latest one — read fresh
    // values here without restoring first and they'd get baked into the
    // snapshot below, permanently losing the real latest value and leaving
    // "Restore latest" only able to undo back to this intermediate point. So
    // put the true latest values back first, then compute this rollback's
    // before-values and snapshot from that clean baseline.
    if (Object.keys(existingSnapshot).length > 0) {
      await writeFields(entityType, entityId, tenantId, existingSnapshot);
      current = { ...current, ...existingSnapshot };
    }

    const logs = await prisma.auditLog.findMany({
      where: { tenantId, targetEntityId: entityId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, metadata: true },
    });
    const patch = filterFields(entityType, computeRollbackPatch(target, logs));
    const freshValues = pick(current, Object.keys(patch));
    // Keep any previously-snapshotted fields the new patch doesn't touch, and
    // refresh the rest from the just-restored true state.
    const snapshot = { ...existingSnapshot, ...freshValues };

    if (Object.keys(patch).length > 0) {
      await writeFields(entityType, entityId, tenantId, patch);
      recordAuditLog({
        tenantId,
        actorUserId: req.userId!,
        action: "rollback",
        targetEntityType: entityType,
        targetEntityId: entityId,
        before: freshValues,
        after: patch,
      }).catch((err) => req.log.error(err, "audit log write failed"));
    }

    const row = await prisma.auditRollback.upsert({
      where: { tenantId_entityType_entityId: { tenantId, entityType, entityId } },
      create: {
        id: crypto.randomUUID(),
        tenantId,
        entityType,
        entityId,
        rolledBackTo: target,
        snapshot: JSON.parse(JSON.stringify(snapshot)),
        createdById: req.userId ?? null,
      },
      update: {
        rolledBackTo: target,
        snapshot: JSON.parse(JSON.stringify(snapshot)),
        createdById: req.userId ?? null,
      },
    });
    return res.json(toDTO(row));
  } catch (err) {
    req.log.error(err, "Failed to roll back entity");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// "Restore latest": put the snapshot back and drop the rollback point.
auditRollbacksRouter.delete(
  "/:entityType/:entityId",
  requireCapability("manage_pipeline"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      // Cast needed: requireCapability() + this route's parameterised path
      // widens req.params values to `string | string[]` for overload
      // resolution, even though each segment is always a single string at
      // runtime (same issue documented in routes/shots.ts).
      const entityType = parseEntityType(req.params.entityType as string);
      const entityId = req.params.entityId as string;
      if (!entityType)
        return res
          .status(400)
          .json({ error: `entityType must be one of: ${ENTITY_TYPES.join(", ")}` });

      const existing = await prisma.auditRollback.findUnique({
        where: { tenantId_entityType_entityId: { tenantId, entityType, entityId } },
      });
      if (!existing) return res.status(404).json({ error: "No rollback point for this entity" });

      const entity = await loadEntity(entityType, entityId, tenantId);
      if (!entity) return res.status(404).json({ error: "Entity not found" });

      const snapshot = filterFields(entityType, asRecord(existing.snapshot));
      if (Object.keys(snapshot).length > 0) {
        const before = pick(entity as unknown as Record<string, unknown>, Object.keys(snapshot));
        await writeFields(entityType, entityId, tenantId, snapshot);
        recordAuditLog({
          tenantId,
          actorUserId: req.userId!,
          action: "restore",
          targetEntityType: entityType,
          targetEntityId: entityId,
          before,
          after: snapshot,
        }).catch((err) => req.log.error(err, "audit log write failed"));
      }

      await prisma.auditRollback.delete({
        where: { tenantId_entityType_entityId: { tenantId, entityType, entityId } },
      });
      return res.status(204).send();
    } catch (err) {
      req.log.error(err, "Failed to clear audit rollback");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
