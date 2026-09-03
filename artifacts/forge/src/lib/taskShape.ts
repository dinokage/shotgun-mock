import { useMemo } from "react";
import { useShots } from "@/hooks/useShots";
import { useAssets } from "@/hooks/useAssets";

// store/auth.ts's login hydration overwrites useTasksStore's `tasks` (and,
// via the shared TASKS mock array, every other page that still imports TASKS
// directly) with raw, untranslated real TaskDTO[] data: `assignedTo` (not
// `assigneeId`), `entityId`+`entityType` (not `assetId`/`shotId`), and no
// `projectId` at all. Every task list/board/lookup in the app needs to
// tolerate BOTH that real shape and the legacy mock `Task` shape (used
// pre-login, and by any code path that hasn't been hit by hydration yet) —
// this module is the single source of truth for that normalization so it
// doesn't keep getting re-invented (and re-drifting) file by file.

/** Real TaskDTO's `assignedTo`, or legacy mock Task's `assigneeId`. */
export const getAssigneeId = (t: any): string | null | undefined =>
  t.assignedTo ?? t.assigneeId;

/**
 * A task's project. Real TaskDTO has no `projectId` column at all — it's
 * only reachable via `entityId` -> shot/asset -> `projectId`, hence the
 * `entityProjectMap` (see useEntityProjectMap below). Legacy mock Task has
 * `projectId` directly, so that's tried first.
 */
export const getProjectId = (
  t: any,
  entityProjectMap: Record<string, string>,
): string | undefined => t.projectId ?? entityProjectMap[t.entityId];

/** Real TaskDTO's shot, via `entityType`/`entityId`, or legacy mock Task's `shotId`. */
export const getShotId = (t: any): string | undefined =>
  t.entityType === "shot" ? t.entityId : t.shotId;

/** Real TaskDTO's asset, via `entityType`/`entityId`, or legacy mock Task's `assetId`. */
export const getAssetId = (t: any): string | undefined =>
  t.entityType === "asset" ? t.entityId : t.assetId;

/**
 * Builds the entityId -> projectId lookup that getProjectId() needs for real
 * TaskDTO[] data, from the live shots/assets queries. React Query dedupes
 * this against any other useShots()/useAssets() call on the page, so calling
 * this alongside them is free.
 */
export function useEntityProjectMap(): Record<string, string> {
  const { data: liveShots = [] } = useShots();
  const { data: liveAssets = [] } = useAssets();
  return useMemo(() => {
    const map: Record<string, string> = {};
    liveShots.forEach((s) => {
      map[s.id] = s.projectId;
    });
    liveAssets.forEach((a) => {
      map[a.id] = a.projectId;
    });
    return map;
  }, [liveShots, liveAssets]);
}

/**
 * Resolves who can act as the production-manager approval gate for a task's
 * department: that department's own `production_head`, falling back to the
 * Production Management department's `production_head`(s) — the studio's
 * overall production management — falling back to any `production_head` in
 * the tenant if neither exists. Most departments don't have their own
 * production_head assigned, so this fallback chain is the normal path, not
 * an edge case.
 */
export function getProductionManagerApprovers(
  departmentName: string | null | undefined,
  users: { id: string; role: string; departmentId?: string | null }[],
  departments: { id: string; name: string }[],
): string[] {
  const productionHeads = users.filter((u) => u.role === "production_head");
  if (productionHeads.length === 0) return [];

  const dept = departments.find((d) => d.name === departmentName);
  const ownDeptPMs = dept
    ? productionHeads.filter((u) => u.departmentId === dept.id)
    : [];
  if (ownDeptPMs.length > 0) return ownDeptPMs.map((u) => u.id);

  const mainDept = departments.find((d) => d.name === "Production Management");
  const mainPMs = mainDept
    ? productionHeads.filter((u) => u.departmentId === mainDept.id)
    : [];
  if (mainPMs.length > 0) return mainPMs.map((u) => u.id);

  return productionHeads.map((u) => u.id);
}

export function canApproveAsProductionManager(
  currentUserId: string,
  departmentName: string | null | undefined,
  users: { id: string; role: string; departmentId?: string | null }[],
  departments: { id: string; name: string }[],
): boolean {
  return getProductionManagerApprovers(departmentName, users, departments).includes(
    currentUserId,
  );
}
