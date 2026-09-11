import { Request } from "express";
import { prisma } from "@workspace/db";

// Until now every list endpoint returned the whole tenant to every role and
// each page filtered for display only -- an artist's session could read all
// ~1k tasks, every shot and the full roster straight from the API. This module
// is the single server-side definition of what each role may see, so the
// filtering can't be bypassed by talking to the API directly.
export type VisibilityScope =
  | { kind: "all" }
  | {
      kind: "department";
      userId: string;
      departmentId: string;
      departmentName: string | null;
    }
  | { kind: "own"; userId: string; departmentId: string | null };

// Studio-wide oversight. The producer is the single studio-wide reviewer and
// the production head runs resourcing across departments, so both need the
// same unrestricted read the admin has.
const STUDIO_WIDE_ROLES = ["admin", "production_head", "producer"];

export async function getVisibilityScope(req: Request): Promise<VisibilityScope> {
  const tenantId = req.tenantId!;
  const roleId = req.roleId;
  const userId = req.userId;

  if (!roleId || !userId) return { kind: "own", userId: userId ?? "", departmentId: null };

  const role = await prisma.tenantRole.findFirst({
    where: { id: roleId, tenantId },
    select: { name: true },
  });
  if (role && STUDIO_WIDE_ROLES.includes(role.name)) return { kind: "all" };

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { departmentId: true },
  });

  // A lead sees their whole department; without one there is no department to
  // scope to, so they fall back to their own work rather than the tenant.
  if (role?.name === "lead" && user?.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: user.departmentId, tenantId },
      select: { name: true },
    });
    return {
      kind: "department",
      userId,
      departmentId: user.departmentId,
      departmentName: dept?.name ?? null,
    };
  }

  return { kind: "own", userId, departmentId: user?.departmentId ?? null };
}

/**
 * Prisma `where` fragment restricting a Task query to what `scope` may see.
 * Tasks carry `department` as a name string, not a FK, which is why the
 * department scope needs the resolved name rather than the id.
 */
export function taskScopeWhere(scope: VisibilityScope) {
  switch (scope.kind) {
    case "all":
      return {};
    case "department":
      // A lead also holds tasks of their own, which may sit outside the
      // department string (imported tracksheet rows often leave it null).
      return scope.departmentName
        ? { OR: [{ department: scope.departmentName }, { assignedTo: scope.userId }] }
        : { assignedTo: scope.userId };
    case "own":
      return { assignedTo: scope.userId };
  }
}

/**
 * Prisma `where` fragment restricting a DailyLog query to what `scope` may
 * see. Logs belong to a user, not a department, so the department scope is
 * resolved to that department's roster (plus the lead themselves, who may
 * sit outside their own department's user rows).
 */
export async function dailyLogScopeWhere(
  tenantId: string,
  scope: VisibilityScope,
) {
  switch (scope.kind) {
    case "all":
      return {};
    case "department": {
      const members = await prisma.user.findMany({
        where: { tenantId, departmentId: scope.departmentId },
        select: { id: true },
      });
      return { userId: { in: [...new Set([...members.map((m) => m.id), scope.userId])] } };
    }
    case "own":
      return { userId: scope.userId };
  }
}

/** The Task.entityType values the pipeline entity routers scope through. */
export type ScopedEntityType = "shot" | "asset";

/**
 * Ids of the shots/assets `scope` may see, or `null` for "no restriction".
 * Neither table carries an assignee the pipeline actually populates, so
 * "work I hold" is defined by the tasks pointing at the row
 * (Task.entityId / Task.entityType).
 */
export async function visibleEntityIds(
  tenantId: string,
  scope: VisibilityScope,
  entityType: ScopedEntityType,
): Promise<string[] | null> {
  if (scope.kind === "all") return null;
  const rows = await prisma.task.findMany({
    where: { tenantId, entityType, ...taskScopeWhere(scope) },
    select: { entityId: true },
    distinct: ["entityId"],
  });
  return rows.map((r) => r.entityId);
}

/**
 * Ids of the sequences `scope` may see, or `null` for "no restriction". A
 * sequence has no tasks of its own; it is visible when it holds a shot or
 * asset the caller has work on.
 */
export async function visibleSequenceIds(
  tenantId: string,
  scope: VisibilityScope,
): Promise<string[] | null> {
  if (scope.kind === "all") return null;
  const [shotIds, assetIds] = await Promise.all([
    visibleEntityIds(tenantId, scope, "shot"),
    visibleEntityIds(tenantId, scope, "asset"),
  ]);
  const [shots, assets] = await Promise.all([
    prisma.shot.findMany({
      where: { tenantId, id: { in: shotIds ?? [] }, sequenceId: { not: null } },
      select: { sequenceId: true },
      distinct: ["sequenceId"],
    }),
    prisma.asset.findMany({
      where: { tenantId, id: { in: assetIds ?? [] }, sequenceId: { not: null } },
      select: { sequenceId: true },
      distinct: ["sequenceId"],
    }),
  ]);
  return [
    ...new Set([...shots, ...assets].map((r) => r.sequenceId as string)),
  ];
}

/**
 * True when `scope` may see the task `taskId` at all.
 *
 * The task sub-resource routes (checklist/comments/dependencies/attachments/
 * approval-events) were tenant-filtered only, so an artist who knew or
 * guessed a task id could still read the comments and approval history of a
 * task that no longer appears in their own list -- the list filter alone is
 * not an access boundary. Fails closed: an unresolvable scope resolves to
 * "own" upstream in getVisibilityScope, and a task that doesn't match the
 * scope's own `where` is simply not found.
 */
export async function canSeeTask(
  tenantId: string,
  scope: VisibilityScope,
  taskId: string,
): Promise<boolean> {
  if (!taskId) return false;
  const row = await prisma.task.findFirst({
    where: { id: taskId, tenantId, ...taskScopeWhere(scope) },
    select: { id: true },
  });
  return !!row;
}

/**
 * Prisma `where` fragment restricting an entityType/entityId-keyed table
 * (Version, Review, AuditLog targets) to the shots/assets `scope` may see,
 * or `null` for "no restriction" (studio-wide roles only).
 *
 * Rows whose entityType is neither "shot" nor "asset" are excluded rather
 * than passed through -- there is no third pipeline entity whose visibility
 * is defined today, so the narrow answer is the safe one.
 */
export async function entityRefScopeWhere(
  tenantId: string,
  scope: VisibilityScope,
): Promise<{ OR: { entityType: string; entityId: { in: string[] } }[] } | null> {
  if (scope.kind === "all") return null;
  const [shotIds, assetIds] = await Promise.all([
    visibleEntityIds(tenantId, scope, "shot"),
    visibleEntityIds(tenantId, scope, "asset"),
  ]);
  return {
    OR: [
      { entityType: "shot", entityId: { in: shotIds ?? [] } },
      { entityType: "asset", entityId: { in: assetIds ?? [] } },
    ],
  };
}

/**
 * The project/episode ids reachable from the shots and assets `scope` may
 * see. A project/episode carries no assignment of its own, so "mine" means
 * "holds work I can see" -- derived from exactly the same shot/asset sets
 * the shots/assets endpoints return, which keeps the frontend coherent: any
 * shot a caller can list always has its project and episode in these lists.
 */
async function visibleEntityParents(
  tenantId: string,
  scope: VisibilityScope,
): Promise<{ projectId: string; episodeId: string | null }[]> {
  const [shotIds, assetIds] = await Promise.all([
    visibleEntityIds(tenantId, scope, "shot"),
    visibleEntityIds(tenantId, scope, "asset"),
  ]);
  const [shots, assets] = await Promise.all([
    prisma.shot.findMany({
      where: { tenantId, id: { in: shotIds ?? [] } },
      select: { projectId: true, episodeId: true },
    }),
    prisma.asset.findMany({
      where: { tenantId, id: { in: assetIds ?? [] } },
      select: { projectId: true, episodeId: true },
    }),
  ]);
  return [...shots, ...assets];
}

/** Ids of the projects `scope` may see, or `null` for "no restriction". */
export async function visibleProjectIds(
  tenantId: string,
  scope: VisibilityScope,
): Promise<string[] | null> {
  if (scope.kind === "all") return null;
  const rows = await visibleEntityParents(tenantId, scope);
  return [...new Set(rows.map((r) => r.projectId))];
}

/** Ids of the episodes `scope` may see, or `null` for "no restriction". */
export async function visibleEpisodeIds(
  tenantId: string,
  scope: VisibilityScope,
): Promise<string[] | null> {
  if (scope.kind === "all") return null;
  const rows = await visibleEntityParents(tenantId, scope);
  return [...new Set(rows.map((r) => r.episodeId).filter((id): id is string => !!id))];
}

/**
 * True when `scope` may act on the shot/asset `entityId` at all.
 *
 * Holding a capability says what KIND of change you may make, never WHICH
 * rows you may make it to. The list endpoints were scoped first, which left
 * the write handlers reachable by id alone -- an artist who never saw a shot
 * in their own list could still PUT to it, including flipping a client's
 * review sign-off. Mirrors canSeeTask for the entity routers.
 */
export async function canSeeEntity(
  tenantId: string,
  scope: VisibilityScope,
  entityType: ScopedEntityType,
  entityId: string,
): Promise<boolean> {
  if (!entityId) return false;
  const visible = await visibleEntityIds(tenantId, scope, entityType);
  // null means "no restriction" -- studio-wide roles only.
  return visible === null || visible.includes(entityId);
}

/** Cache-key suffix so one role's scoped list can't be served to another. */
export function scopeCacheKey(scope: VisibilityScope): string {
  switch (scope.kind) {
    case "all":
      return "all";
    case "department":
      return `dept:${scope.departmentId}`;
    case "own":
      return `own:${scope.userId}`;
  }
}
