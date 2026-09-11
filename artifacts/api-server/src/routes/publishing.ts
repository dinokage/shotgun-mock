import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

export const publishingRouter = Router();

publishingRouter.use(tenantAuthMiddleware);
// The publish pipeline is internal studio machinery; a client-access session
// has no legitimate use for it.
publishingRouter.use(denyClientAccess);

const PUBLISH_KINDS = ["shot", "asset"] as const;
const ENTITY_TYPES = ["shot", "asset"] as const;
const PUBLISH_STATUSES = ["queued", "validating", "success", "failed"] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

interface ValidationEntry {
  name: string;
  passed: boolean;
  detail: string;
}

// validationLog is free-form JSON in the column, so anything read back out has
// to be re-validated rather than trusted -- a row written before a rule
// existed must not crash a read.
function parseValidationLog(value: unknown): ValidationEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ValidationEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.name !== "string") continue;
    out.push({
      name: entry.name,
      passed: entry.passed === true,
      detail: typeof entry.detail === "string" ? entry.detail : "",
    });
  }
  return out;
}

function validateValidationLog(value: unknown): ValidationEntry[] | null {
  if (!Array.isArray(value)) return null;
  const out: ValidationEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.name !== "string" || !entry.name) return null;
    if (typeof entry.passed !== "boolean") return null;
    if (entry.detail !== undefined && typeof entry.detail !== "string") return null;
    out.push({ name: entry.name, passed: entry.passed, detail: (entry.detail as string) ?? "" });
  }
  return out;
}

// A DB foreign key only proves the referenced row exists, not who owns it, and
// entityId has no FK at all -- so every id arriving from a client is checked
// against the caller's own tenant before it is written. Same pattern as
// routes/shots.ts / routes/tasks.ts.
async function entityInTenant(entityType: EntityType, id: string, tenantId: string) {
  const row =
    entityType === "shot"
      ? await prisma.shot.findFirst({ where: { id, tenantId }, select: { id: true } })
      : await prisma.asset.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

async function taskInTenant(id: string, tenantId: string) {
  const row = await prisma.task.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

async function versionInTenant(id: string, tenantId: string) {
  const row = await prisma.version.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

type PublishLogRow = {
  id: string;
  publishKind: string;
  entityType: string;
  entityId: string;
  taskId: string | null;
  versionId: string | null;
  publishedById: string | null;
  publishedAt: Date;
  status: string;
  fileName: string;
  fileSize: string;
  notes: string;
  validationLog: unknown;
  publishedBy: { id: string; name: string } | null;
};

// The page lists publishes by the shot/asset they belong to, so the display
// names are resolved here in two batched queries rather than leaving the
// client to guess from an opaque id.
async function resolveEntityNames(tenantId: string, rows: PublishLogRow[]) {
  const shotIds = rows.filter((r) => r.entityType === "shot").map((r) => r.entityId);
  const assetIds = rows.filter((r) => r.entityType === "asset").map((r) => r.entityId);
  const [shots, assets] = await Promise.all([
    shotIds.length
      ? prisma.shot.findMany({ where: { tenantId, id: { in: shotIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    assetIds.length
      ? prisma.asset.findMany({ where: { tenantId, id: { in: assetIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  return new Map([
    ...shots.map((s) => [`shot:${s.id}`, s.name] as const),
    ...assets.map((a) => [`asset:${a.id}`, a.name] as const),
  ]);
}

function toDTO(row: PublishLogRow, names: Map<string, string>) {
  return {
    id: row.id,
    publishKind: row.publishKind,
    entityType: row.entityType,
    entityId: row.entityId,
    entityName: names.get(`${row.entityType}:${row.entityId}`) ?? null,
    taskId: row.taskId,
    versionId: row.versionId,
    publishedById: row.publishedById,
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt.toISOString(),
    status: row.status,
    fileName: row.fileName,
    fileSize: row.fileSize,
    notes: row.notes,
    validationLog: parseValidationLog(row.validationLog),
  };
}

const PUBLISH_LOG_SELECT = {
  id: true,
  publishKind: true,
  entityType: true,
  entityId: true,
  taskId: true,
  versionId: true,
  publishedById: true,
  publishedAt: true,
  status: true,
  fileName: true,
  fileSize: true,
  notes: true,
  validationLog: true,
  publishedBy: { select: { id: true, name: true } },
} as const;

publishingRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType, status, publishKind } = req.query;

    const where: Record<string, unknown> = { tenantId };
    if (typeof entityId === "string" && entityId) where.entityId = entityId;
    if (typeof entityType === "string" && entityType) where.entityType = entityType;
    if (typeof status === "string" && status) where.status = status;
    if (typeof publishKind === "string" && publishKind) where.publishKind = publishKind;

    const parsedLimit = Number(req.query.limit);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 200;

    const rows = await prisma.publishLog.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: limit,
      select: PUBLISH_LOG_SELECT,
    });

    const names = await resolveEntityNames(tenantId, rows);
    return res.json(rows.map((row) => toDTO(row, names)));
  } catch (err) {
    req.log.error(err, "Failed to fetch publish logs");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Artists, leads and producers all publish their own work, so this is gated on
// edit_tasks (artist/lead/producer/production_head) rather than a leadership-only
// capability like manage_pipeline.
publishingRouter.post("/", requireCapability("edit_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const {
      publishKind,
      entityType,
      entityId,
      taskId,
      versionId,
      status,
      fileName,
      fileSize,
      notes,
      validationLog,
    } = req.body ?? {};

    if (!PUBLISH_KINDS.includes(publishKind))
      return res.status(400).json({ error: `publishKind must be one of: ${PUBLISH_KINDS.join(", ")}` });
    if (!ENTITY_TYPES.includes(entityType))
      return res.status(400).json({ error: `entityType must be one of: ${ENTITY_TYPES.join(", ")}` });
    if (typeof entityId !== "string" || !entityId)
      return res.status(400).json({ error: "entityId is required" });
    if (status !== undefined && !PUBLISH_STATUSES.includes(status))
      return res.status(400).json({ error: `status must be one of: ${PUBLISH_STATUSES.join(", ")}` });

    if (!(await entityInTenant(entityType, entityId, tenantId)))
      return res.status(400).json({ error: "entityId does not belong to this tenant" });
    if (taskId !== undefined && taskId !== null) {
      if (typeof taskId !== "string" || !(await taskInTenant(taskId, tenantId)))
        return res.status(400).json({ error: "taskId does not belong to this tenant" });
    }
    if (versionId !== undefined && versionId !== null) {
      if (typeof versionId !== "string" || !(await versionInTenant(versionId, tenantId)))
        return res.status(400).json({ error: "versionId does not belong to this tenant" });
    }

    let checks: ValidationEntry[] = [];
    if (validationLog !== undefined) {
      const parsed = validateValidationLog(validationLog);
      if (!parsed)
        return res
          .status(400)
          .json({ error: "validationLog must be an array of { name, passed, detail? }" });
      checks = parsed;
    }

    const created = await prisma.publishLog.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        publishKind,
        entityType,
        entityId,
        taskId: typeof taskId === "string" ? taskId : null,
        versionId: typeof versionId === "string" ? versionId : null,
        publishedById: req.userId ?? null,
        status: status ?? "queued",
        fileName: typeof fileName === "string" ? fileName : "",
        fileSize: typeof fileSize === "string" ? fileSize : "0MB",
        notes: typeof notes === "string" ? notes : "",
        validationLog: JSON.parse(JSON.stringify(checks)),
      },
      select: PUBLISH_LOG_SELECT,
    });

    const names = await resolveEntityNames(tenantId, [created]);
    return res.status(201).json(toDTO(created, names));
  } catch (err) {
    req.log.error(err, "Failed to create publish log");
    return res.status(500).json({ error: "Internal server error" });
  }
});

publishingRouter.put("/:id", requireCapability("edit_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: requireCapability() + this route's "/:id" typing widens
    // req.params.id to `string | string[]` for overload resolution purposes,
    // even though a plain ":id" segment is always a single string at runtime
    // (same issue documented in routes/versions.ts).
    const logId = req.params.id as string;
    const { status, notes, fileSize, validationLog } = req.body ?? {};

    if (!PUBLISH_STATUSES.includes(status))
      return res.status(400).json({ error: `status must be one of: ${PUBLISH_STATUSES.join(", ")}` });

    const updates: Record<string, unknown> = { status };
    if (notes !== undefined) {
      if (typeof notes !== "string") return res.status(400).json({ error: "notes must be a string" });
      updates.notes = notes;
    }
    if (fileSize !== undefined) {
      if (typeof fileSize !== "string")
        return res.status(400).json({ error: "fileSize must be a string" });
      updates.fileSize = fileSize;
    }
    if (validationLog !== undefined) {
      const parsed = validateValidationLog(validationLog);
      if (!parsed)
        return res
          .status(400)
          .json({ error: "validationLog must be an array of { name, passed, detail? }" });
      updates.validationLog = JSON.parse(JSON.stringify(parsed));
    }

    const existing = await prisma.publishLog.findFirst({
      where: { tenantId, id: logId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Publish log not found" });

    await prisma.publishLog.updateMany({ where: { tenantId, id: logId }, data: updates });
    const updated = await prisma.publishLog.findFirstOrThrow({
      where: { tenantId, id: logId },
      select: PUBLISH_LOG_SELECT,
    });

    const names = await resolveEntityNames(tenantId, [updated]);
    return res.json(toDTO(updated, names));
  } catch (err) {
    req.log.error(err, "Failed to update publish log");
    return res.status(500).json({ error: "Internal server error" });
  }
});
