import { useMemo } from "react";
import { isTaskDone } from "@/data/mockData";
import { normalizeTaskStatus } from "@/lib/trackingStatus";
import { getProjectId, useEntityProjectMap } from "@/lib/taskShape";
import { useTasksStore } from "@/store/tasks";

// The real `projects` table has no `progress` column — the mock Project type's
// `progress`/`shotsCount`/`assetsCount`/`budget`/`riskScore` fields are all
// `undefined` against live data, which is how dashboards ended up rendering a
// bare "%" and NaN. The only truthful measure of how far a project has come is
// its own tasks, reached the same way everything else reaches them: task ->
// entityId -> shot/asset -> projectId (see taskShape.ts).

export interface ProjectProgress {
  total: number;
  done: number;
  /** null when the project has no tasks — there is nothing to take a percentage of. */
  percent: number | null;
}

export function computeProjectProgress(
  tasks: { status: string }[],
  entityProjectMap: Record<string, string>,
): Map<string, ProjectProgress> {
  const counts = new Map<string, { total: number; done: number }>();
  tasks.forEach((t) => {
    const projectId = getProjectId(t, entityProjectMap);
    if (!projectId) return;
    const entry = counts.get(projectId) ?? { total: 0, done: 0 };
    entry.total += 1;
    // Real statuses are studio tracksheet codes ("Client_App", "WFF", ...),
    // so they have to be resolved to a pipeline stage before counting.
    if (isTaskDone(normalizeTaskStatus(t.status))) entry.done += 1;
    counts.set(projectId, entry);
  });

  const progress = new Map<string, ProjectProgress>();
  counts.forEach((c, projectId) =>
    progress.set(projectId, {
      ...c,
      percent: c.total > 0 ? Math.round((c.done / c.total) * 100) : null,
    }),
  );
  return progress;
}

/** Empty rather than absent, so callers can render "no tasks" without a null check. */
export const NO_PROJECT_PROGRESS: ProjectProgress = {
  total: 0,
  done: 0,
  percent: null,
};

export function useProjectProgress(): Map<string, ProjectProgress> {
  const tasks = useTasksStore((state) => state.tasks);
  const entityProjectMap = useEntityProjectMap();
  return useMemo(
    () => computeProjectProgress(tasks, entityProjectMap),
    [tasks, entityProjectMap],
  );
}
