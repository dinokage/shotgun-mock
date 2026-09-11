import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

export const pipelineTemplatesRouter = Router();
export const projectPipelinesRouter = Router();

pipelineTemplatesRouter.use(tenantAuthMiddleware);
// The production pipeline is internal studio process; a client-access
// session has no legitimate use for it.
pipelineTemplatesRouter.use(denyClientAccess);
projectPipelinesRouter.use(tenantAuthMiddleware);
projectPipelinesRouter.use(denyClientAccess);

interface StageOverride {
  sortOrder?: number;
  enabled?: boolean;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

// stageOverrides is free-form JSON in the column, so anything read back out
// has to be re-validated rather than trusted -- a row written before a
// validation rule existed (or by a future migration) must not crash a read.
function parseOverrides(value: unknown): Record<string, StageOverride> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, StageOverride> = {};
  for (const [stageId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const override: StageOverride = {};
    if (typeof entry.sortOrder === "number" && Number.isFinite(entry.sortOrder))
      override.sortOrder = entry.sortOrder;
    if (typeof entry.enabled === "boolean") override.enabled = entry.enabled;
    out[stageId] = override;
  }
  return out;
}

type StageRow = {
  id: string;
  name: string;
  shortCode: string;
  sortOrder: number;
  departmentId: string | null;
  isOptional: boolean;
  outputFormats: unknown;
  keepsLocalCopy: boolean;
  reviewAudience: unknown;
  dccPublishKind: string | null;
  department: { id: string; name: string; abbr: string; color: string | null } | null;
};

// The template is never forked per project: a project's stage list is always
// the template's own stages with its ProjectPipeline.stageOverrides laid on
// top, so a later template edit still reaches every project that hasn't
// deliberately diverged on that specific stage.
function resolveStages(
  stages: StageRow[],
  overrides: Record<string, StageOverride>,
  taskCounts: Map<string, number>,
) {
  return stages
    .map((stage) => {
      const override = overrides[stage.id];
      const sortOrder = override?.sortOrder ?? stage.sortOrder;
      const enabled = override?.enabled ?? true;
      return {
        id: stage.id,
        name: stage.name,
        shortCode: stage.shortCode,
        templateSortOrder: stage.sortOrder,
        sortOrder,
        enabled,
        // Only a value that actually differs from the template counts as a
        // divergence -- an override row that restates the template's own
        // sortOrder is not something the project has deliberately changed.
        overridden: sortOrder !== stage.sortOrder || !enabled,
        departmentId: stage.departmentId,
        department: stage.department,
        isOptional: stage.isOptional,
        outputFormats: asStringArray(stage.outputFormats),
        keepsLocalCopy: stage.keepsLocalCopy,
        reviewAudience: asStringArray(stage.reviewAudience),
        dccPublishKind: stage.dccPublishKind,
        taskCount: taskCounts.get(stage.id) ?? 0,
      };
    })
    // Overrides only carry a sortOrder for the stages actually moved, so ties
    // against untouched stages fall back to the template's own order (then id)
    // to keep the resolved list stable between reads.
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.templateSortOrder - b.templateSortOrder ||
        a.id.localeCompare(b.id),
    );
}

async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

// Tasks carry entityId/entityType (shot or asset) rather than a projectId
// column, so anything asking "which tasks belong to this project" has to go
// through the project's own shots and assets.
async function projectEntityIds(tenantId: string, projectId: string) {
  const [shots, assets] = await Promise.all([
    prisma.shot.findMany({ where: { tenantId, projectId }, select: { id: true } }),
    prisma.asset.findMany({ where: { tenantId, projectId }, select: { id: true } }),
  ]);
  return [...shots.map((s) => s.id), ...assets.map((a) => a.id)];
}

async function stageTaskCounts(tenantId: string, projectId: string) {
  const entityIds = await projectEntityIds(tenantId, projectId);
  if (entityIds.length === 0) return new Map<string, number>();

  const grouped = await prisma.task.groupBy({
    by: ["pipelineStageId"],
    where: { tenantId, entityId: { in: entityIds }, pipelineStageId: { not: null } },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.pipelineStageId as string, g._count._all]));
}

const STAGE_SELECT = {
  id: true,
  name: true,
  shortCode: true,
  sortOrder: true,
  departmentId: true,
  isOptional: true,
  outputFormats: true,
  keepsLocalCopy: true,
  reviewAudience: true,
  dccPublishKind: true,
  department: { select: { id: true, name: true, abbr: true, color: true } },
} as const;

pipelineTemplatesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const templates = await prisma.pipelineTemplate.findMany({
      where: { tenantId },
      orderBy: [{ entityKind: "asc" }, { name: "asc" }],
      include: { stages: { select: STAGE_SELECT, orderBy: { sortOrder: "asc" } } },
    });

    return res.json(
      templates.map((t) => ({
        id: t.id,
        name: t.name,
        discipline: t.discipline,
        entityKind: t.entityKind,
        description: t.description,
        isDefault: t.isDefault,
        stages: t.stages.map((s) => ({
          id: s.id,
          name: s.name,
          shortCode: s.shortCode,
          sortOrder: s.sortOrder,
          departmentId: s.departmentId,
          department: s.department,
          isOptional: s.isOptional,
          outputFormats: asStringArray(s.outputFormats),
          keepsLocalCopy: s.keepsLocalCopy,
          reviewAudience: asStringArray(s.reviewAudience),
          dccPublishKind: s.dccPublishKind,
        })),
      })),
    );
  } catch (err) {
    req.log.error(err, "Failed to fetch pipeline templates");
    return res.status(500).json({ error: "Internal server error" });
  }
});

async function loadProjectPipelines(tenantId: string, projectId: string) {
  const [bindings, taskCounts] = await Promise.all([
    prisma.projectPipeline.findMany({
      where: { tenantId, projectId },
      include: {
        template: {
          include: { stages: { select: STAGE_SELECT, orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    stageTaskCounts(tenantId, projectId),
  ]);

  return bindings
    .map((binding) => ({
      projectPipelineId: binding.id,
      templateId: binding.templateId,
      templateName: binding.template.name,
      discipline: binding.template.discipline,
      entityKind: binding.template.entityKind,
      description: binding.template.description,
      stages: resolveStages(binding.template.stages, parseOverrides(binding.stageOverrides), taskCounts),
    }))
    .sort((a, b) => a.entityKind.localeCompare(b.entityKind) || a.templateName.localeCompare(b.templateName));
}

projectPipelinesRouter.get("/:projectId/pipeline", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.params;
    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(404).json({ error: "Project not found" });

    return res.json({ projectId, pipelines: await loadProjectPipelines(tenantId, projectId) });
  } catch (err) {
    req.log.error(err, "Failed to resolve project pipeline");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Binding a template is how a project picks up a discipline's pipeline at
// all -- without it the VFX and 2D templates are seeded but unreachable, and
// a project's stage order can only ever be the one it was created with.
projectPipelinesRouter.post(
  "/:projectId/pipeline",
  requireCapability("manage_pipeline"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const projectId = req.params.projectId as string;
      const { templateId } = req.body ?? {};

      if (typeof templateId !== "string" || !templateId)
        return res.status(400).json({ error: "templateId is required" });

      if (!(await projectInTenant(projectId, tenantId)))
        return res.status(404).json({ error: "Project not found" });

      const template = await prisma.pipelineTemplate.findFirst({
        where: { id: templateId, tenantId },
        select: { id: true },
      });
      if (!template) return res.status(400).json({ error: "Invalid templateId" });

      // @@unique([projectId, templateId]) makes a re-bind a no-op rather than
      // an error: two producers attaching the same template concurrently
      // should both end up looking at the same binding, not a 409.
      const existing = await prisma.projectPipeline.findFirst({
        where: { tenantId, projectId, templateId },
        select: { id: true },
      });
      if (!existing) {
        await prisma.projectPipeline.create({
          data: { id: crypto.randomUUID(), tenantId, projectId, templateId },
        });
      }

      const pipelines = await loadProjectPipelines(tenantId, projectId);
      return res.status(existing ? 200 : 201).json({
        projectId,
        pipeline: pipelines.find((p) => p.templateId === templateId) ?? null,
      });
    } catch (err) {
      req.log.error(err, "Failed to bind pipeline template to project");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

projectPipelinesRouter.delete(
  "/:projectId/pipeline/:templateId",
  requireCapability("manage_pipeline"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const projectId = req.params.projectId as string;
      const templateId = req.params.templateId as string;

      if (!(await projectInTenant(projectId, tenantId)))
        return res.status(404).json({ error: "Project not found" });

      const binding = await prisma.projectPipeline.findFirst({
        where: { tenantId, projectId, templateId },
        select: { id: true },
      });
      if (!binding) return res.status(404).json({ error: "Template is not bound to this project" });

      const stages = await prisma.pipelineStage.findMany({
        where: { tenantId, templateId },
        select: { id: true },
      });
      const entityIds = await projectEntityIds(tenantId, projectId);

      // Task.pipelineStageId has no cascade, so unbinding a template whose
      // stages are still in use would leave those tasks pointing at a stage
      // the project no longer resolves -- invisible everywhere in the UI.
      // Only this project's own tasks block: another project bound to the
      // same shared template is none of this unbind's business.
      const blocking =
        stages.length > 0 && entityIds.length > 0
          ? await prisma.task.count({
              where: {
                tenantId,
                entityId: { in: entityIds },
                pipelineStageId: { in: stages.map((s) => s.id) },
              },
            })
          : 0;
      if (blocking > 0)
        return res.status(409).json({
          error: `Cannot unbind: ${blocking} task${blocking === 1 ? " is" : "s are"} still assigned to a stage of this pipeline`,
          taskCount: blocking,
        });

      await prisma.projectPipeline.delete({ where: { id: binding.id } });
      return res.status(204).send();
    } catch (err) {
      req.log.error(err, "Failed to unbind pipeline template from project");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

projectPipelinesRouter.put(
  "/:projectId/pipeline",
  requireCapability("manage_pipeline"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const projectId = req.params.projectId as string;
      const { templateId, stageOverrides } = req.body ?? {};

      if (typeof templateId !== "string" || !templateId)
        return res.status(400).json({ error: "templateId is required" });
      if (!stageOverrides || typeof stageOverrides !== "object" || Array.isArray(stageOverrides))
        return res.status(400).json({ error: "stageOverrides must be an object keyed by stage id" });

      if (!(await projectInTenant(projectId, tenantId)))
        return res.status(404).json({ error: "Project not found" });

      // The binding lookup is itself the template ownership check: a
      // ProjectPipeline row only exists for a template already bound to this
      // project, and it is scoped to the caller's tenant here, so a template
      // id from another tenant (or one simply not on this project) can never
      // be written through.
      const binding = await prisma.projectPipeline.findFirst({
        where: { tenantId, projectId, templateId },
        select: { id: true },
      });
      if (!binding)
        return res.status(400).json({ error: "templateId is not bound to this project" });

      const stageIds = Object.keys(stageOverrides);
      const validated: Record<string, StageOverride> = {};
      for (const stageId of stageIds) {
        const raw = (stageOverrides as Record<string, unknown>)[stageId];
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
          return res.status(400).json({ error: `Invalid override for stage ${stageId}` });
        const entry = raw as Record<string, unknown>;
        const override: StageOverride = {};
        if (entry.sortOrder !== undefined) {
          if (!Number.isInteger(entry.sortOrder))
            return res.status(400).json({ error: `sortOrder for stage ${stageId} must be an integer` });
          override.sortOrder = entry.sortOrder as number;
        }
        if (entry.enabled !== undefined) {
          if (typeof entry.enabled !== "boolean")
            return res.status(400).json({ error: `enabled for stage ${stageId} must be a boolean` });
          override.enabled = entry.enabled;
        }
        validated[stageId] = override;
      }

      if (stageIds.length > 0) {
        const owned = await prisma.pipelineStage.findMany({
          where: { tenantId, templateId, id: { in: stageIds } },
          select: { id: true },
        });
        if (owned.length !== stageIds.length) {
          const ownedIds = new Set(owned.map((s) => s.id));
          const foreign = stageIds.filter((id) => !ownedIds.has(id));
          return res
            .status(400)
            .json({ error: `Stage ids do not belong to this template: ${foreign.join(", ")}` });
        }
      }

      await prisma.projectPipeline.update({
        where: { id: binding.id },
        data: { stageOverrides: JSON.parse(JSON.stringify(validated)) },
      });

      const pipelines = await loadProjectPipelines(tenantId, projectId);
      return res.json({
        projectId,
        pipeline: pipelines.find((p) => p.templateId === templateId) ?? null,
      });
    } catch (err) {
      req.log.error(err, "Failed to update project pipeline overrides");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
