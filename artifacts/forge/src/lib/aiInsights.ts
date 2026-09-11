/**
 * Forge AI Insights — rule-based, not a model call.
 *
 * Every insight below is derived at render time from real relationships in
 * mockData (task/asset dependency graphs, weeklyRating, riskScore, shot
 * status) rather than hand-written prose. The `reasoning` string is built
 * from the same numbers surfaced in the UI, so it stays traceable: change
 * the mock data and the flagged entity, counts, and copy all change with it.
 *
 * Every function below takes assets/projects/shots/tasks as explicit
 * parameters rather than reading the raw ASSETS/PROJECTS/SHOTS/TASKS mock
 * arrays directly. Those arrays are mutated in place by fetchMe() on login
 * (real data replaces the seeded content), which updates their *contents*
 * but not their object identity -- a caller's useMemo gated on some other
 * dependency (e.g. departments) can settle before that mutation lands and
 * then never recompute again, freezing the dashboard's insights at
 * whatever was true (often the seeded mock data) at first render. Passing
 * the arrays in lets the caller depend on the same live-store/react-query
 * values everywhere else in the app already does, so recomputation is
 * driven by real reference/state changes instead of a mutation React can't see.
 */

import type { Asset, Department, Project, Shot, Task } from "@/data/mockData";
import { getAssetId, getAssigneeId, getProjectId } from "@/lib/taskShape";
import { normalizeTaskStatus } from "@/lib/trackingStatus";

export type InsightSeverity = "critical" | "warning" | "positive";

export interface AIInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  /** The "why" line — states the computed condition that triggered the flag. */
  reasoning: string;
  actionLabel: string;
  actionHref: string;
  /**
   * What to do about it. Separated from `reasoning` on purpose: the finding
   * and the suggested response are different claims, and a reader has to be
   * able to disagree with the second while still trusting the first.
   */
  recommendation?: string;
  /** The single number the finding turns on, for a compact display. */
  metric?: { label: string; value: string };
}

/**
 * Who the insights are being computed for. Mirrors the server's
 * VisibilityScope (see api-server/src/lib/visibilityScope.ts) — the stores
 * these functions read are already filtered to that scope by the API, so this
 * decides which *questions* to ask, not which rows are legible.
 */
export type InsightAudience = "studio" | "department" | "own";

export interface InsightContext {
  audience: InsightAudience;
  /** The viewer — used by the "own" audience and to phrase recommendations. */
  currentUserId?: string;
  /** Department name for a lead, used only for wording; rows are pre-scoped. */
  departmentName?: string | null;
  assets: Asset[];
  projects: Project[];
  shots: Shot[];
  tasks: Task[];
  users: { id: string; name: string; departmentId?: string | null }[];
  departments: Department[];
  entityProjectMap: Record<string, string>;
}

const DAY_MS = 86_400_000;

/** Whole days between `iso` and now; negative when `iso` is in the future. */
function daysSince(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

function nameOf(
  users: InsightContext["users"],
  userId: string | undefined,
): string {
  if (!userId) return "Unassigned";
  return users.find((u) => u.id === userId)?.name ?? "Unknown";
}

// Stages where work is genuinely waiting on a reviewer rather than on the
// artist. Kept separate from UNRESOLVED_TASK_STATUSES because "open" and
// "sitting in someone's review queue" call for completely different actions.
const REVIEW_STAGE_STATUSES = new Set<Task["status"]>([
  "review",
  "lead-review",
  "pm-review",
]);

// Tasks in these states still represent open work — they can block downstream
// work or count toward a department's active load.
const UNRESOLVED_TASK_STATUSES = new Set<Task["status"]>([
  "todo",
  "not-started",
  "in-progress",
  "bottleneck",
  "review",
  "lead-review",
  "pm-review",
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
function findBlockingAssetInsight(
  assets: Asset[],
  tasks: Task[],
  projects: Project[],
  entityProjectMap: Record<string, string>,
): AIInsight | null {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const dependents = new Map<string, string[]>();
  for (const asset of assets) {
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
      const impactedTasks = tasks.filter((t) => {
        const assetId = getAssetId(t);
        return (
          assetId &&
          activeDependentSet.has(assetId) &&
          UNRESOLVED_TASK_STATUSES.has(t.status)
        );
      });
      const projectCount = new Set(
        impactedTasks
          .map((t) => getProjectId(t, entityProjectMap))
          .filter((pid): pid is string => Boolean(pid)),
      ).size;
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

  const project = projects.find((p) => p.id === top.source.projectId);

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
function groupActiveTasksByDept(tasks: Task[]): Map<string, Task[]> {
  const byDept = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!UNRESOLVED_TASK_STATUSES.has(t.status)) continue;
    const list = byDept.get(t.department) ?? [];
    list.push(t);
    byDept.set(t.department, list);
  }
  return byDept;
}

/** Finds the department with the highest share of self-reported "behind" pace tasks. */
function findDepartmentPaceInsight(
  tasks: Task[],
  departments: Department[],
): AIInsight | null {
  const ranked = Array.from(groupActiveTasksByDept(tasks).entries())
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

function computeProjectRiskScore(
  allShots: Shot[],
  projectId: string,
): {
  score: number;
  flaggedShots: number;
  totalShots: number;
} {
  const shots = allShots.filter((s) => s.projectId === projectId);
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
function findProjectRiskInsight(
  projects: Project[],
  shots: Shot[],
): AIInsight | null {
  const ranked = projects
    .filter((p) => p.status !== "COMPLETE")
    .map((p) => ({ project: p, risk: computeProjectRiskScore(shots, p.id) }))
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
function findDepartmentOnTrackInsight(
  tasks: Task[],
  departments: Department[],
): AIInsight | null {
  const ranked = Array.from(groupActiveTasksByDept(tasks).entries())
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
 * Open work whose due date has already passed.
 *
 * Deliberately reported as one insight naming the worst case rather than one
 * insight per task: a feed of forty identical "X is overdue" cards is a list,
 * not an analysis, and it buries every other finding underneath it.
 */
function findOverdueInsight(ctx: InsightContext): AIInsight | null {
  const overdue = ctx.tasks
    .filter((t) => UNRESOLVED_TASK_STATUSES.has(t.status))
    .map((t) => ({ task: t, late: daysSince(t.dueDate) }))
    .filter((r): r is { task: Task; late: number } => (r.late ?? -1) > 0)
    .sort((a, b) => b.late - a.late);

  if (overdue.length === 0) return null;

  const worst = overdue[0];
  const totalLateDays = overdue.reduce((sum, r) => sum + r.late, 0);
  const owners = new Set(overdue.map((r) => r.task.assigneeId).filter(Boolean));
  const unassigned = overdue.filter((r) => !r.task.assigneeId).length;
  const scopeWord =
    ctx.audience === "own"
      ? "of your tasks are"
      : ctx.audience === "department"
        ? `in ${ctx.departmentName ?? "this department"} are`
        : "across the studio are";

  // Who is carrying the lateness. Said three different ways because the three
  // cases call for completely different responses, and collapsing them into
  // "across N people" reported a phantom person whenever the whole backlog
  // was unassigned -- which is exactly the state a fresh studio starts in.
  const ownerClause =
    owners.size === 0
      ? ", none of it assigned to anyone"
      : unassigned > 0
        ? `, spread across ${owners.size} ${plural(owners.size, "person", "people")} with ${unassigned} unassigned`
        : ` across ${owners.size} ${plural(owners.size, "person", "people")}`;

  const averageLate = Math.round(totalLateDays / overdue.length);

  return {
    id: "overdue-open-work",
    // One task a day late is a scheduling nit; a backlog averaging over a
    // week late is a plan that no longer describes reality.
    severity: averageLate >= 7 ? "critical" : "warning",
    title: `${overdue.length} overdue ${plural(overdue.length, "task")}`,
    // Reports the average rather than the cumulative total: "12,257 days
    // late" is arithmetically true and tells a reader nothing, where "34 days
    // late on average" is immediately actionable.
    reasoning: `${overdue.length} open ${plural(overdue.length, "task")} ${scopeWord} past their due date, ${averageLate} ${plural(averageLate, "day")} late on average${ownerClause}. The oldest is "${worst.task.title}"${worst.task.assigneeId ? ` (${nameOf(ctx.users, worst.task.assigneeId)})` : ""}, ${worst.late} ${plural(worst.late, "day")} past due and still "${worst.task.status.replace(/-/g, " ")}".`,
    recommendation:
      ctx.audience === "own"
        ? "Re-date what has genuinely moved and flag the rest to your lead — a due date nobody has corrected stops being useful to anyone."
        : owners.size === 0
          ? "None of this is assigned, so nobody is currently accountable for any of it. Assign the oldest first, or re-date the backlog honestly — an overdue list nobody owns just trains people to ignore the dates."
          : "Work the oldest first: the longest-overdue task is usually the one whose blocker nobody has named out loud yet.",
    metric: { label: "Overdue", value: String(overdue.length) },
    actionLabel: "View Tasks",
    actionHref: "/my-tasks",
  };
}

/**
 * Work that is nominally in progress but has not changed state in a week.
 *
 * This is the finding that is genuinely hard to get by eye: a stalled task
 * looks identical to a healthy one on every board in the app, because both
 * read "in progress". Only the timestamp separates them.
 */
function findStalledInsight(ctx: InsightContext): AIInsight | null {
  const STALL_DAYS = 7;
  const stalled = ctx.tasks
    .filter(
      (t) => t.status === "in-progress" || t.status === "bottleneck",
    )
    .map((t) => ({ task: t, idle: daysSince(t.lastStatusUpdate) }))
    .filter(
      (r): r is { task: Task; idle: number } => (r.idle ?? 0) >= STALL_DAYS,
    )
    .sort((a, b) => b.idle - a.idle);

  if (stalled.length === 0) return null;

  const worst = stalled[0];
  const byPerson = new Map<string, number>();
  for (const { task } of stalled) {
    byPerson.set(task.assigneeId, (byPerson.get(task.assigneeId) ?? 0) + 1);
  }
  const heaviest = Array.from(byPerson.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    id: "stalled-in-progress",
    severity: worst.idle >= 14 ? "critical" : "warning",
    title: `${stalled.length} ${plural(stalled.length, "task")} stalled`,
    reasoning: `${stalled.length} ${plural(stalled.length, "task")} ${plural(stalled.length, "is", "are")} marked in progress but ${plural(stalled.length, "has", "have")} not changed status in ${STALL_DAYS}+ days. The longest is "${worst.task.title}"${worst.task.assigneeId ? ` (${nameOf(ctx.users, worst.task.assigneeId)})` : ""} at ${worst.idle} days untouched.${heaviest && heaviest[0] && heaviest[1] > 1 ? ` ${nameOf(ctx.users, heaviest[0])} holds ${heaviest[1]} of them.` : ""} Stalled work is invisible on every board here — it reads the same as work that is moving.`,
    recommendation:
      ctx.audience === "own"
        ? "Update the status or log what is blocking you; silence reads as progress and nobody will come to help."
        : "Ask what is actually blocking each one. A task idle two weeks is usually waiting on a decision or a file, not on effort.",
    metric: { label: "Longest stall", value: `${worst.idle}d` },
    actionLabel: "View Tasks",
    actionHref: "/tracking",
  };
}

/**
 * Work already submitted and now waiting on a reviewer.
 *
 * Separated from the overdue analysis because the person who can clear it is
 * the reviewer, not the artist — and because time here is pure dead time: the
 * work is finished and delivering nothing while it queues.
 */
function findReviewBacklogInsight(ctx: InsightContext): AIInsight | null {
  const waiting = ctx.tasks
    .filter((t) => REVIEW_STAGE_STATUSES.has(t.status))
    .map((t) => ({ task: t, waited: daysSince(t.lastStatusUpdate) ?? 0 }))
    .sort((a, b) => b.waited - a.waited);

  if (waiting.length === 0) return null;

  const oldest = waiting[0];
  // Median, not mean: one forgotten submission from last month would drag a
  // mean far enough to misrepresent an otherwise healthy queue.
  const sorted = waiting.map((w) => w.waited).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const stale = waiting.filter((w) => w.waited >= 3).length;

  if (stale === 0) {
    return {
      id: "review-queue-healthy",
      severity: "positive",
      title: "Review queue is current",
      reasoning: `All ${waiting.length} ${plural(waiting.length, "submission")} awaiting review ${plural(waiting.length, "has", "have")} been waiting under 3 days (median ${median} ${plural(median, "day")}). Nothing finished is sitting idle.`,
      metric: { label: "Median wait", value: `${median}d` },
      actionLabel: "Open Reviews",
      actionHref: "/review?queue=1",
    };
  }

  return {
    id: "review-backlog",
    severity: oldest.waited >= 7 ? "critical" : "warning",
    title: `${stale} ${plural(stale, "submission")} waiting on review`,
    reasoning: `${stale} of ${waiting.length} ${plural(waiting.length, "submission")} ${plural(stale, "has", "have")} been sitting in a review stage for 3+ days (median wait ${median} ${plural(median, "day")}). The oldest, "${oldest.task.title}"${oldest.task.assigneeId ? ` from ${nameOf(ctx.users, oldest.task.assigneeId)}` : ""}, has waited ${oldest.waited} days at "${oldest.task.status.replace(/-/g, " ")}". This is finished work delivering nothing while it queues.`,
    recommendation:
      "Clear the oldest submissions first — every day here is dead time the artist already paid for, and it pushes every downstream department's start date out with it.",
    metric: { label: "Oldest wait", value: `${oldest.waited}d` },
    actionLabel: "Open Reviews",
    actionHref: "/review?queue=1",
  };
}

/**
 * How often work comes back from review, from the recorded approval chain.
 *
 * A high rework rate is an upstream problem — an unclear brief, a missing
 * reference, a spec that changed after work started — and it is invisible in
 * any per-task view, because each individual retake looks reasonable.
 */
function findReworkInsight(ctx: InsightContext): AIInsight | null {
  const WINDOW_DAYS = 30;
  const byDept = new Map<string, { reviewed: Set<string>; sentBack: number }>();

  for (const task of ctx.tasks) {
    const dept = task.department || "Unassigned";
    for (const event of task.approvalHistory ?? []) {
      const age = daysSince(event.timestamp);
      if (age === null || age > WINDOW_DAYS) continue;
      const entry = byDept.get(dept) ?? { reviewed: new Set(), sentBack: 0 };
      entry.reviewed.add(task.id);
      if (event.action === "changes-requested" || event.action === "rejected") {
        entry.sentBack += 1;
      }
      byDept.set(dept, entry);
    }
  }

  const ranked = Array.from(byDept.entries())
    .map(([department, e]) => ({
      department,
      tasks: e.reviewed.size,
      sentBack: e.sentBack,
      perTask: e.sentBack / Math.max(1, e.reviewed.size),
    }))
    // Under five reviewed tasks a "rate" is one or two events wearing a
    // percentage sign, which invites exactly the wrong conclusion.
    .filter((r) => r.tasks >= 5 && r.sentBack > 0)
    .sort((a, b) => b.perTask - a.perTask);

  const top = ranked[0];
  if (!top) return null;

  const dept = ctx.departments.find((d) => d.name === top.department);
  const rounded = top.perTask.toFixed(1);

  return {
    id: `rework-${top.department}`,
    severity: top.perTask >= 1.5 ? "critical" : "warning",
    title: `High rework: ${top.department}`,
    reasoning: `${top.department} averaged ${rounded} send-backs per reviewed task over the last ${WINDOW_DAYS} days (${top.sentBack} across ${top.tasks} ${plural(top.tasks, "task")}) — the highest of any department with 5+ reviewed tasks. Rework this high is usually an upstream problem, not an execution one.`,
    recommendation: `Read the send-back comments on ${top.department}'s last few tasks together rather than one at a time. If the same note recurs, fix the brief or the reference pack; if they are all different, the review bar is the thing that is unclear.`,
    metric: { label: "Send-backs/task", value: rounded },
    actionLabel: "View Department",
    actionHref: dept ? `/departments/${dept.id}` : "/departments",
  };
}

/**
 * Where the open work actually sits, per person.
 *
 * Compared against the team median rather than a fixed threshold: what counts
 * as overloaded depends entirely on the department and the shot count, and a
 * hardcoded "more than 8 tasks" number would be wrong for everyone.
 */
function findWorkloadInsight(ctx: InsightContext): AIInsight | null {
  if (ctx.audience === "own") return null;

  const load = new Map<string, { open: number; remaining: number }>();
  for (const t of ctx.tasks) {
    if (!UNRESOLVED_TASK_STATUSES.has(t.status) || !t.assigneeId) continue;
    const entry = load.get(t.assigneeId) ?? { open: 0, remaining: 0 };
    entry.open += 1;
    entry.remaining += Math.max(0, (t.estimatedHours || 0) - (t.actualHours || 0));
    load.set(t.assigneeId, entry);
  }
  if (load.size < 3) return null;

  const ranked = Array.from(load.entries())
    .map(([userId, e]) => ({ userId, ...e }))
    .sort((a, b) => b.open - a.open);

  const counts = ranked.map((r) => r.open).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];
  const top = ranked[0];

  // Only worth surfacing when one person is carrying materially more than the
  // team's middle — otherwise this is just a sorted list.
  if (median === 0 || top.open < median * 2 || top.open - median < 3) return null;

  return {
    id: `workload-${top.userId}`,
    severity: top.open >= median * 3 ? "critical" : "warning",
    title: `Uneven load: ${nameOf(ctx.users, top.userId)}`,
    reasoning: `${nameOf(ctx.users, top.userId)} is carrying ${top.open} open ${plural(top.open, "task")} (~${Math.round(top.remaining)}h of estimated work remaining) against a team median of ${median}. That is ${(top.open / median).toFixed(1)}× the middle of the team.`,
    recommendation: `Move the lowest-priority items off ${nameOf(ctx.users, top.userId)} before the due dates force the decision. Concentrated load is also single-point risk: one sick day takes ${top.open} ${plural(top.open, "task")} with it.`,
    metric: { label: "Open tasks", value: `${top.open} vs ${median}` },
    actionLabel: "View Workload",
    actionHref: "/people",
  };
}

/**
 * People in scope with no open work at all — the other half of the resourcing
 * question, and the one no board in the app answers, because someone with
 * nothing assigned simply does not appear on it.
 */
function findIdleCapacityInsight(ctx: InsightContext): AIInsight | null {
  if (ctx.audience === "own") return null;

  const busy = new Set(
    ctx.tasks
      .filter((t) => UNRESOLVED_TASK_STATUSES.has(t.status))
      .map((t) => t.assigneeId)
      .filter(Boolean),
  );
  const idle = ctx.users.filter(
    (u) => u.id !== ctx.currentUserId && !busy.has(u.id),
  );
  if (idle.length === 0 || busy.size === 0) return null;

  const backlog = ctx.tasks.filter(
    (t) => UNRESOLVED_TASK_STATUSES.has(t.status) && !t.assigneeId,
  ).length;

  return {
    id: "idle-capacity",
    severity: backlog > 0 ? "warning" : "positive",
    title: `${idle.length} ${plural(idle.length, "person", "people")} with no open work`,
    reasoning: `${idle.map((u) => u.name).slice(0, 4).join(", ")}${idle.length > 4 ? ` and ${idle.length - 4} others` : ""} ${plural(idle.length, "has", "have")} no unresolved tasks assigned${backlog > 0 ? `, while ${backlog} open ${plural(backlog, "task")} ${plural(backlog, "sits", "sit")} unassigned` : ""}.`,
    recommendation:
      backlog > 0
        ? "Assign the unassigned backlog to the free capacity before it becomes next week's overdue list."
        : "Free capacity with no backlog is the right moment to pull work forward from the next sequence.",
    metric: { label: "Free", value: String(idle.length) },
    actionLabel: "View People",
    actionHref: "/people",
  };
}

/** Tasks that have burned materially more hours than they were estimated. */
function findOverrunInsight(ctx: InsightContext): AIInsight | null {
  const OVERRUN_FACTOR = 1.25;
  const overrun = ctx.tasks
    .filter(
      (t) =>
        UNRESOLVED_TASK_STATUSES.has(t.status) &&
        (t.estimatedHours || 0) > 0 &&
        (t.actualHours || 0) > t.estimatedHours * OVERRUN_FACTOR,
    )
    .map((t) => ({ task: t, over: t.actualHours - t.estimatedHours }))
    .sort((a, b) => b.over - a.over);

  if (overrun.length === 0) return null;

  const worst = overrun[0];
  const totalOver = overrun.reduce((s, r) => s + r.over, 0);

  return {
    id: "estimate-overrun",
    severity: overrun.length >= 5 ? "warning" : "positive",
    title: `${overrun.length} ${plural(overrun.length, "task")} over estimate`,
    reasoning: `${overrun.length} still-open ${plural(overrun.length, "task")} ${plural(overrun.length, "has", "have")} logged more than ${Math.round((OVERRUN_FACTOR - 1) * 100)}% over ${plural(overrun.length, "its", "their")} estimate, ${Math.round(totalOver)}h beyond plan in total. The largest is "${worst.task.title}" (${nameOf(ctx.users, worst.task.assigneeId)}) at ${worst.task.actualHours}h against ${worst.task.estimatedHours}h estimated.`,
    recommendation:
      "Re-estimate rather than absorb. These hours are already spent; the schedule downstream is still being planned as though they were not.",
    metric: { label: "Hours over", value: `${Math.round(totalOver)}h` },
    actionLabel: "View Tracking",
    actionHref: "/tracking",
  };
}

/** Work due inside the next three days that has not been submitted yet. */
function findDueSoonInsight(ctx: InsightContext): AIInsight | null {
  const HORIZON = 3;
  const soon = ctx.tasks
    .filter(
      (t) =>
        UNRESOLVED_TASK_STATUSES.has(t.status) &&
        !REVIEW_STAGE_STATUSES.has(t.status),
    )
    .map((t) => ({ task: t, inDays: -(daysSince(t.dueDate) ?? -999) }))
    .filter((r) => r.inDays >= 0 && r.inDays <= HORIZON)
    .sort((a, b) => a.inDays - b.inDays);

  if (soon.length === 0) return null;

  const notStarted = soon.filter(
    (r) => r.task.status === "not-started" || r.task.status === "todo",
  ).length;

  return {
    id: "due-soon",
    severity: notStarted > 0 ? "warning" : "positive",
    title: `${soon.length} due within ${HORIZON} days`,
    reasoning: `${soon.length} unsubmitted ${plural(soon.length, "task")} ${plural(soon.length, "falls", "fall")} due in the next ${HORIZON} days${notStarted > 0 ? `, and ${notStarted} of ${plural(notStarted, "them", "them")} ${plural(notStarted, "has", "have")} not been started` : " — all of them already in progress"}. Soonest: "${soon[0].task.title}" (${nameOf(ctx.users, soon[0].task.assigneeId)}), due in ${soon[0].inDays} ${plural(soon[0].inDays, "day")}.`,
    recommendation:
      notStarted > 0
        ? "The not-yet-started ones are the decision: start them today or move the date now, while moving it is still cheap."
        : "Nothing here needs intervention — this is the week landing as planned.",
    metric: { label: "Due soon", value: String(soon.length) },
    actionLabel: "View Tasks",
    actionHref: ctx.audience === "own" ? "/my-tasks" : "/tracking",
  };
}

/**
 * Role-aware insight feed.
 *
 * The three audiences get genuinely different questions rather than the same
 * list filtered down: a producer needs to know where the studio's throughput
 * is leaking, a lead needs to know who in their department is stuck and what
 * is queued on them, and an artist needs to know what is about to bite them.
 * Every insight is computed from the rows currently in the stores — which the
 * API has already scoped to what this person may see — so nothing here can
 * surface a number drawn from data the viewer is not allowed to read.
 */
export function generateInsights(rawCtx: InsightContext): AIInsight[] {
  // Every analysis below compares against the app's canonical stages and
  // reads `assigneeId`. Tasks in the stores carry neither reliably: rows
  // imported from the studio's tracksheet keep their own vocabulary
  // ("TK_02_APP", "WFF", "Client_Tk02_Rtk"), and the API's task shape uses
  // `assignedTo`. Normalising once here rather than inside each analyser is
  // what keeps these insights from silently finding nothing against real
  // production data while looking perfectly correct in review.
  const ctx: InsightContext = {
    ...rawCtx,
    tasks: rawCtx.tasks.map((t) => ({
      ...t,
      status: normalizeTaskStatus(t.status),
      assigneeId: getAssigneeId(t) ?? "",
    })),
  };

  const common = [
    findOverdueInsight(ctx),
    findStalledInsight(ctx),
    findDueSoonInsight(ctx),
  ];

  if (ctx.audience === "own") {
    return [...common, findOverrunInsight(ctx)].filter(
      (i): i is AIInsight => i !== null,
    );
  }

  const managerial = [
    findReviewBacklogInsight(ctx),
    findWorkloadInsight(ctx),
    findIdleCapacityInsight(ctx),
    findReworkInsight(ctx),
    findOverrunInsight(ctx),
  ];

  const studioWide =
    ctx.audience === "studio"
      ? [
          findBlockingAssetInsight(
            ctx.assets,
            ctx.tasks,
            ctx.projects,
            ctx.entityProjectMap,
          ),
          findProjectRiskInsight(ctx.projects, ctx.shots),
          findDepartmentPaceInsight(ctx.tasks, ctx.departments),
          findDepartmentOnTrackInsight(ctx.tasks, ctx.departments),
        ]
      : [];

  const all = [...common, ...managerial, ...studioWide].filter(
    (i): i is AIInsight => i !== null,
  );

  // Most-urgent first, but a feed that is nothing but red stops being read, so
  // the ordering is by severity rather than by which analysis ran first.
  const rank: Record<InsightSeverity, number> = {
    critical: 0,
    warning: 1,
    positive: 2,
  };
  return all.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/**
 * Computes the Producer dashboard's AI Insights feed. Order is most-urgent
 * first: dependency bottleneck, department pace warning, project risk, then
 * a positive signal. Any insight whose underlying condition doesn't hold
 * against the current data (e.g. no department has a "behind" task) is
 * omitted rather than shown with placeholder text.
 */
export function generateProducerInsights(
  assets: Asset[],
  projects: Project[],
  shots: Shot[],
  tasks: Task[],
  departments: Department[],
  entityProjectMap: Record<string, string>,
): AIInsight[] {
  return [
    findBlockingAssetInsight(assets, tasks, projects, entityProjectMap),
    findDepartmentPaceInsight(tasks, departments),
    findProjectRiskInsight(projects, shots),
    findDepartmentOnTrackInsight(tasks, departments),
  ].filter((insight): insight is AIInsight => insight !== null);
}
