/**
 * Forge AI Insights — rule-based, not a model call.
 *
 * Every insight below is derived at render time from real relationships in
 * mockData (task/asset dependency graphs, weeklyRating, riskScore, shot
 * status) rather than hand-written prose. The `reasoning` string is built
 * from the same numbers surfaced in the UI, so it stays traceable: change
 * the mock data and the flagged entity, counts, and copy all change with it.
 */

import {
  ASSETS,
  PROJECTS,
  SHOTS,
  TASKS,
  type Asset,
  type Department,
  type Task,
} from "@/data/mockData";

export type InsightSeverity = "critical" | "warning" | "positive";

export interface AIInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  /** The "why" line — states the computed condition that triggered the flag. */
  reasoning: string;
  actionLabel: string;
  actionHref: string;
}

// Tasks in these states still represent open work — they can block downstream
// work or count toward a department's active load.
const UNRESOLVED_TASK_STATUSES = new Set<Task["status"]>([
  "todo",
  "not-started",
  "in-progress",
  "bottleneck",
  "review",
  "lead-review",
]);

// Assets in these states are still "live" — a dependency on one of these can
// genuinely hold up downstream work, unlike a dependency that's already complete.
const ACTIVE_ASSET_STATUSES = new Set<Asset["status"]>([
  "in-progress",
  "bottleneck",
  "at-risk",
  "not-started",
  "review",
]);

const STUCK_ASSET_STATUSES = new Set<Asset["status"]>([
  "bottleneck",
  "at-risk",
]);

const MIN_DEPT_SAMPLE = 8; // ignore departments too small to make a rate meaningful

/**
 * Walks Asset.dependencies to build the inverse graph (what depends on X),
 * then finds the asset with the largest fan-out of still-active dependents,
 * preferring one that is itself stuck (bottleneck/at-risk).
 */
function findBlockingAssetInsight(): AIInsight | null {
  const assetById = new Map(ASSETS.map((a) => [a.id, a]));
  const dependents = new Map<string, string[]>();
  for (const asset of ASSETS) {
    for (const depId of asset.dependencies) {
      const list = dependents.get(depId) ?? [];
      list.push(asset.id);
      dependents.set(depId, list);
    }
  }

  const candidates = Array.from(dependents.entries())
    .map(([assetId, dependentIds]) => {
      const source = assetById.get(assetId);
      if (!source) return null;
      const activeDependentIds = dependentIds.filter((id) =>
        ACTIVE_ASSET_STATUSES.has(assetById.get(id)!.status),
      );
      const activeDependentSet = new Set(activeDependentIds);
      const impactedTasks = TASKS.filter(
        (t) =>
          t.assetId &&
          activeDependentSet.has(t.assetId) &&
          UNRESOLVED_TASK_STATUSES.has(t.status),
      );
      const projectCount = new Set(impactedTasks.map((t) => t.projectId)).size;
      return {
        source,
        activeDependents: activeDependentIds.length,
        impactedTasks: impactedTasks.length,
        projectCount,
      };
    })
    .filter(
      (c): c is NonNullable<typeof c> => c !== null && c.activeDependents > 0,
    );

  candidates.sort((a, b) => {
    const aStuck = STUCK_ASSET_STATUSES.has(a.source.status) ? 1 : 0;
    const bStuck = STUCK_ASSET_STATUSES.has(b.source.status) ? 1 : 0;
    if (aStuck !== bStuck) return bStuck - aStuck;
    return b.activeDependents - a.activeDependents;
  });

  const top = candidates[0];
  if (!top) return null;

  const project = PROJECTS.find((p) => p.id === top.source.projectId);

  return {
    id: `blocker-${top.source.id}`,
    severity: STUCK_ASSET_STATUSES.has(top.source.status)
      ? "critical"
      : "warning",
    title: `Dependency Bottleneck: ${top.source.name}`,
    reasoning: `Flagged because ${top.source.name}${project ? ` (${project.name})` : ""} is currently "${top.source.status.replace("-", " ")}" and is a dependency of ${top.activeDependents} other active asset${top.activeDependents === 1 ? "" : "s"} — feeding ${top.impactedTasks} unresolved task${top.impactedTasks === 1 ? "" : "s"} across ${top.projectCount} project${top.projectCount === 1 ? "" : "s"}. Largest downstream fan-out in the studio.`,
    actionLabel: "View Blocked Asset",
    actionHref: `/assets/${top.source.id}`,
  };
}

/** Groups unresolved tasks by department, keeping only departments with a meaningful sample. */
function groupActiveTasksByDept(): Map<string, Task[]> {
  const byDept = new Map<string, Task[]>();
  for (const t of TASKS) {
    if (!UNRESOLVED_TASK_STATUSES.has(t.status)) continue;
    const list = byDept.get(t.department) ?? [];
    list.push(t);
    byDept.set(t.department, list);
  }
  return byDept;
}

/** Finds the department with the highest share of self-reported "behind" pace tasks. */
function findDepartmentPaceInsight(departments: Department[]): AIInsight | null {
  const ranked = Array.from(groupActiveTasksByDept().entries())
    .filter(([, tasks]) => tasks.length >= MIN_DEPT_SAMPLE)
    .map(([department, tasks]) => {
      const behind = tasks.filter((t) => t.weeklyRating === "behind").length;
      return {
        department,
        active: tasks.length,
        behind,
        rate: behind / tasks.length,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.active - a.active);

  const top = ranked[0];
  if (!top || top.behind === 0) return null;

  const dept = departments.find((d) => d.name === top.department);
  const pct = Math.round(top.rate * 100);

  return {
    id: `pace-${top.department}`,
    severity: pct >= 50 ? "critical" : "warning",
    title: `Bottleneck Warning: ${top.department}`,
    reasoning: `Flagged because ${top.behind} of ${top.active} active tasks (${pct}%) in ${top.department} are self-reported "behind" pace this week — the highest behind-pace rate of any department with ${MIN_DEPT_SAMPLE}+ active tasks.`,
    actionLabel: "View Department",
    actionHref: dept ? `/departments/${dept.id}` : "/departments",
  };
}

function computeProjectRiskScore(projectId: string): {
  score: number;
  flaggedShots: number;
  totalShots: number;
} {
  const shots = SHOTS.filter((s) => s.projectId === projectId);
  if (shots.length === 0) return { score: 0, flaggedShots: 0, totalShots: 0 };
  const flaggedShots = shots.filter(
    (s) => s.status === "bottleneck" || s.status === "at-risk",
  ).length;
  return {
    score: Math.round((flaggedShots / shots.length) * 100),
    flaggedShots,
    totalShots: shots.length,
  };
}

/** Finds the non-complete project carrying the highest studio-assigned risk score. */
function findProjectRiskInsight(): AIInsight | null {
  const ranked = PROJECTS.filter((p) => p.status !== "COMPLETE")
    .map((p) => ({ project: p, risk: computeProjectRiskScore(p.id) }))
    .filter((r) => r.risk.totalShots > 0)
    .sort((a, b) => b.risk.score - a.risk.score);

  const top = ranked[0];
  if (!top || top.risk.score === 0) return null;

  const deadlineClause = top.project.endDate
    ? ` against a ${new Date(top.project.endDate).toLocaleDateString()} deadline`
    : "";

  return {
    id: `risk-${top.project.id}`,
    severity: top.risk.score >= 60 ? "critical" : "warning",
    title: `Elevated Risk: ${top.project.name}`,
    reasoning: `Flagged because ${top.project.name} carries the highest studio risk score (${top.risk.score}/100) among non-complete projects${deadlineClause}, with ${top.risk.flaggedShots} of ${top.risk.totalShots} shots in a bottleneck or at-risk state.`,
    actionLabel: "View Project",
    actionHref: `/projects/${top.project.id}`,
  };
}

/** Finds the department with the highest share of self-reported "on-track" tasks — a genuine positive signal, not just the inverse of the pace warning. */
function findDepartmentOnTrackInsight(departments: Department[]): AIInsight | null {
  const ranked = Array.from(groupActiveTasksByDept().entries())
    .filter(([, tasks]) => tasks.length >= MIN_DEPT_SAMPLE)
    .map(([department, tasks]) => {
      const onTrack = tasks.filter((t) => t.weeklyRating === "on-track").length;
      return {
        department,
        active: tasks.length,
        onTrack,
        rate: onTrack / tasks.length,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.active - a.active);

  const top = ranked[0];
  if (!top || top.rate === 0) return null;

  const dept = departments.find((d) => d.name === top.department);
  const pct = Math.round(top.rate * 100);

  return {
    id: `ontrack-${top.department}`,
    severity: "positive",
    title: `Healthy Pace: ${top.department}`,
    reasoning: `Flagged because ${top.onTrack} of ${top.active} active tasks (${pct}%) in ${top.department} are self-reported "on-track" — the best pace of any department with ${MIN_DEPT_SAMPLE}+ active tasks.`,
    actionLabel: "View Department",
    actionHref: dept ? `/departments/${dept.id}` : "/departments",
  };
}

/**
 * Computes the Producer dashboard's AI Insights feed. Order is most-urgent
 * first: dependency bottleneck, department pace warning, project risk, then
 * a positive signal. Any insight whose underlying condition doesn't hold
 * against the current data (e.g. no department has a "behind" task) is
 * omitted rather than shown with placeholder text.
 */
export function generateProducerInsights(
  departments: Department[],
): AIInsight[] {
  return [
    findBlockingAssetInsight(),
    findDepartmentPaceInsight(departments),
    findProjectRiskInsight(),
    findDepartmentOnTrackInsight(departments),
  ].filter((insight): insight is AIInsight => insight !== null);
}
