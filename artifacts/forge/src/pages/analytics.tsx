import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { isTaskDone } from "@/data/mockData";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import { useProjectStore } from "@/store/projects";
import { useTasksStore } from "@/store/tasks";
import { useReviewStore } from "@/store/reviews";
import { usePublishLogs } from "@/hooks/usePublishLogs";
import { useShotStore } from "@/store/shots";
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { useCapability } from "@/hooks/use-capability";
import { getAssigneeId, getShotId, getProjectId, useEntityProjectMap } from "@/lib/taskShape";
import { normalizeTaskStatus } from "@/lib/trackingStatus";
import { useProjectProgress, NO_PROJECT_PROGRESS } from "@/lib/projectProgress";

const DATE_RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;
type DateRangeKey = keyof typeof DATE_RANGE_DAYS;

function withinRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Number of buckets the delivery/workload grids split the selected range into. */
const TREND_BUCKETS = 8;

function bucketIndex(
  time: number,
  start: number,
  end: number,
  bucketMs: number,
): number {
  if (Number.isNaN(time) || time < start || time > end) return -1;
  return Math.min(TREND_BUCKETS - 1, Math.floor((time - start) / bucketMs));
}

// users.punched_in_at is now real backend state for every user (not just
// the logged-in one -- see hooks/useUsers.ts's usePunchIn/usePunchOut and
// GET /users), so a punched-in session's elapsed hours can be computed for
// anyone directly at render time. No per-user hook/interval needed: the
// Timecards table already re-renders on the users list's ~10s poll
// (App.tsx's fetchMe), which is a fine enough cadence for this summary.
function hoursSincePunchIn(punchedInAt: string): number {
  return Math.max(0, (Date.now() - new Date(punchedInAt).getTime()) / 3600000);
}

export default function Analytics() {
  const { toast } = useToast();
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const projects = useProjectStore((s) => s.projects);
  const tasks = useTasksStore((s) => s.tasks);
  const reviews = useReviewStore((s) => s.reviews);
  const { data: publishLogs = [] } = usePublishLogs();
  const shots = useShotStore((s) => s.shots);
  const canViewFinancials = useCapability("view_financials");

  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");

  // Current period is [now - N days, now]; previous period is the N days
  // immediately before that, so every KPI's trend arrow is a real comparison
  // against the prior period of equal length instead of a hardcoded string.
  const { rangeEnd, currentStart, previousStart, previousEnd } = useMemo(() => {
    const days = DATE_RANGE_DAYS[dateRange];
    const end = new Date();
    const curStart = new Date(end);
    curStart.setDate(curStart.getDate() - days);
    // 1ms before curStart, not curStart itself - withinRange is inclusive on
    // both ends, so an end equal to the current period's start would let any
    // record landing exactly on that boundary instant count in both periods.
    const prevEnd = new Date(curStart.getTime() - 1);
    const prevStart = new Date(curStart);
    prevStart.setDate(prevStart.getDate() - days);
    return {
      rangeEnd: end,
      currentStart: curStart,
      previousStart: prevStart,
      previousEnd: prevEnd,
    };
  }, [dateRange]);

  const filteredTasks = useMemo(
    () => tasks.filter((t) => withinRange(t.createdAt, currentStart, rangeEnd)),
    [tasks, currentStart, rangeEnd],
  );
  const filteredReviews = useMemo(
    () =>
      reviews.filter((r) => withinRange(r.createdAt, currentStart, rangeEnd)),
    [reviews, currentStart, rangeEnd],
  );
  const filteredPublishLogs = useMemo(
    () =>
      publishLogs.filter((p) =>
        withinRange(p.publishedAt, currentStart, rangeEnd),
      ),
    [publishLogs, currentStart, rangeEnd],
  );

  const previousTasks = useMemo(
    () =>
      tasks.filter((t) => withinRange(t.createdAt, previousStart, previousEnd)),
    [tasks, previousStart, previousEnd],
  );
  const previousReviews = useMemo(
    () =>
      reviews.filter((r) =>
        withinRange(r.createdAt, previousStart, previousEnd),
      ),
    [reviews, previousStart, previousEnd],
  );
  const previousPublishLogs = useMemo(
    () =>
      publishLogs.filter((p) =>
        withinRange(p.publishedAt, previousStart, previousEnd),
      ),
    [publishLogs, previousStart, previousEnd],
  );

  function periodStats(
    tasks: typeof filteredTasks,
    reviews: typeof filteredReviews,
    publishLogs: typeof filteredPublishLogs,
  ) {
    const total = tasks.length;
    const done = tasks.filter((t) =>
      isTaskDone(normalizeTaskStatus(t.status)),
    ).length;
    const velocity = total > 0 ? (done / total) * 100 : 0;
    const approvalRate =
      reviews.length > 0
        ? (reviews.filter((r) => r.status === "approved").length /
            reviews.length) *
          100
        : 0;
    const avgReviewTime =
      reviews.length > 0
        ? reviews.reduce(
            (acc, r) =>
              acc +
              (new Date(r.updatedAt).getTime() -
                new Date(r.createdAt).getTime()) /
                3600000,
            0,
          ) / reviews.length
        : 0;
    const publishSuccess =
      publishLogs.length > 0
        ? (publishLogs.filter((p) => p.status === "success").length /
            publishLogs.length) *
          100
        : 0;
    return {
      total,
      done,
      velocity,
      approvalRate,
      avgReviewTime,
      publishSuccess,
    };
  }

  const current = useMemo(
    () => periodStats(filteredTasks, filteredReviews, filteredPublishLogs),
    [filteredTasks, filteredReviews, filteredPublishLogs],
  );
  const previous = useMemo(
    () => periodStats(previousTasks, previousReviews, previousPublishLogs),
    [previousTasks, previousReviews, previousPublishLogs],
  );

  const avgReviewTime = current.avgReviewTime;
  const approvalRate = Math.round(current.approvalRate);
  const publishSuccess = Math.round(current.publishSuccess);
  const velocity = Math.round(current.velocity);

  // A KPI's arrow points in whatever direction the raw number actually
  // moved; whether that movement is colored green ("good") depends on the
  // metric - a shrinking Avg Review Time is an improvement, so unlike the
  // other three (where up = good), it needs up = bad / down = good.
  function trend(
    currentValue: number,
    previousValue: number,
    lowerIsBetter = false,
  ) {
    const delta = currentValue - previousValue;
    const dir: "up" | "down" = delta >= 0 ? "up" : "down";
    const good = lowerIsBetter ? delta <= 0 : delta >= 0;
    return { delta, dir, good };
  }

  const velocityTrend = trend(current.velocity, previous.velocity);
  const reviewTimeTrend = trend(
    current.avgReviewTime,
    previous.avgReviewTime,
    true,
  );
  const approvalTrend = trend(current.approvalRate, previous.approvalRate);
  const publishTrend = trend(current.publishSuccess, previous.publishSuccess);

  const kpis = [
    {
      label: "Total Velocity",
      value: `${velocity}%`,
      change: `${velocityTrend.delta >= 0 ? "+" : ""}${Math.round(velocityTrend.delta)}%`,
      dir: velocityTrend.dir,
      good: velocityTrend.good,
      icon: TrendingUp,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Avg Review Time",
      value: `${avgReviewTime.toFixed(1)}h`,
      change: `${reviewTimeTrend.delta >= 0 ? "+" : ""}${reviewTimeTrend.delta.toFixed(1)}h`,
      dir: reviewTimeTrend.dir,
      good: reviewTimeTrend.good,
      icon: Clock,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      label: "Approval Rate",
      value: `${approvalRate}%`,
      change: `${approvalTrend.delta >= 0 ? "+" : ""}${Math.round(approvalTrend.delta)}%`,
      dir: approvalTrend.dir,
      good: approvalTrend.good,
      icon: CheckCircle2,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "Publish Success",
      value: `${publishSuccess}%`,
      change: `${publishTrend.delta >= 0 ? "+" : ""}${Math.round(publishTrend.delta)}%`,
      dir: publishTrend.dir,
      good: publishTrend.good,
      icon: AlertTriangle,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
  ];

  // Real ranking from actual completion data in the selected range - a
  // completed/approved task credits its assignee, an approved review
  // credits its reviewer - instead of a hardcoded [47,42,38,35,31] zipped
  // onto USERS by array index.
  const contributorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredTasks.forEach((t) => {
      const assigneeId = getAssigneeId(t);
      if (assigneeId && isTaskDone(normalizeTaskStatus(t.status)))
        counts.set(assigneeId, (counts.get(assigneeId) || 0) + 1);
    });
    filteredReviews.forEach((r) => {
      if (r.status === "approved")
        counts.set(r.reviewerId, (counts.get(r.reviewerId) || 0) + 1);
    });
    return counts;
  }, [filteredTasks, filteredReviews]);

  const topContributors = useMemo(
    () =>
      users
        .map((u) => ({ user: u, count: contributorCounts.get(u.id) || 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    [users, contributorCounts],
  );

  // Planned vs delivered, bucketed across the selected range: planned = tasks
  // whose own due date lands in the bucket, delivered = tasks that reached a
  // done stage in it (lastStatusUpdate is the only completion timestamp tasks
  // carry). Both series are counts of real rows, so a quiet range reads as an
  // empty chart rather than an invented curve.
  const deliveryData = useMemo(() => {
    const start = currentStart.getTime();
    const end = rangeEnd.getTime();
    const bucketMs = Math.max(1, (end - start) / TREND_BUCKETS);
    const buckets = Array.from({ length: TREND_BUCKETS }, (_, i) => ({
      label: new Date(start + i * bucketMs).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      planned: 0,
      actual: 0,
    }));

    tasks.forEach((t) => {
      if (t.dueDate) {
        const i = bucketIndex(
          new Date(t.dueDate).getTime(),
          start,
          end,
          bucketMs,
        );
        if (i >= 0) buckets[i].planned += 1;
      }
      if (t.lastStatusUpdate && isTaskDone(normalizeTaskStatus(t.status))) {
        const i = bucketIndex(
          new Date(t.lastStatusUpdate).getTime(),
          start,
          end,
          bucketMs,
        );
        if (i >= 0) buckets[i].actual += 1;
      }
    });
    return buckets;
  }, [tasks, currentStart, rangeEnd]);

  const maxDelivery = Math.max(
    0,
    ...deliveryData.flatMap((d) => [d.planned, d.actual]),
  );

  // Department workload: open (not done, not cancelled) tasks per department,
  // bucketed by their own due dates across the selected range. Real capacity
  // would need per-artist availability hours, which this database doesn't
  // carry — so this counts committed work instead of claiming a % load.
  const departmentWorkload = useMemo(() => {
    const start = currentStart.getTime();
    const end = rangeEnd.getTime();
    const bucketMs = Math.max(1, (end - start) / TREND_BUCKETS);
    const rows = departments.slice(0, 6).map((dept) => ({
      dept,
      weeks: Array.from({ length: TREND_BUCKETS }, () => 0),
    }));
    const byName = new Map(rows.map((r) => [r.dept.name, r]));

    tasks.forEach((t) => {
      const row = t.department ? byName.get(t.department) : undefined;
      if (!row || !t.dueDate) return;
      const stage = normalizeTaskStatus(t.status);
      if (isTaskDone(stage) || stage === "cancelled") return;
      const i = bucketIndex(new Date(t.dueDate).getTime(), start, end, bucketMs);
      if (i < 0) return;
      row.weeks[i] += 1;
    });

    const labels = Array.from({ length: TREND_BUCKETS }, (_, i) =>
      new Date(start + i * bucketMs).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    );
    const peak = Math.max(0, ...rows.flatMap((r) => r.weeks));
    return { rows, labels, peak };
  }, [tasks, departments, currentStart, rangeEnd]);

  // Real per-task bid vs. logged hours for the burn-rate panel. actualHours is
  // only ever written by time logging, so with nothing logged the panel says
  // so instead of substituting a number.
  const burnRateTasks = useMemo(
    () => filteredTasks.filter((t) => (t.actualHours || 0) > 0).slice(0, 5),
    [filteredTasks],
  );

  // Review statistics, all counted off the reviews actually in range.
  const reviewStats = useMemo(() => {
    const versionsReviewed = new Set(filteredReviews.map((r) => r.versionId))
      .size;
    const activeReviewers = new Set(filteredReviews.map((r) => r.reviewerId))
      .size;
    return {
      logged: filteredReviews.length,
      avgRounds:
        versionsReviewed > 0 ? filteredReviews.length / versionsReviewed : null,
      activeReviewers,
    };
  }, [filteredReviews]);

  // Per-project bid vs. logged hours, summed from each project's own tasks
  // (task -> entityId -> shot/asset -> projectId). No rate card exists in the
  // database, so this stays in hours and never turns into dollars.
  const entityProjectMap = useEntityProjectMap();
  const projectProgress = useProjectProgress();
  const projectHours = useMemo(() => {
    const map = new Map<string, { estimated: number; actual: number }>();
    tasks.forEach((t) => {
      const projectId = getProjectId(t, entityProjectMap);
      if (!projectId) return;
      const entry = map.get(projectId) ?? { estimated: 0, actual: 0 };
      entry.estimated += t.estimatedHours || 0;
      entry.actual += t.actualHours || 0;
      map.set(projectId, entry);
    });
    return map;
  }, [tasks, entityProjectMap]);

  function toCSV(rows: (string | number)[][]): string {
    return rows
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
  }

  // Real CSV export of the data currently on screen (respects the selected
  // date range), not a window.print() call disguised as "Export".
  function handleExport() {
    const rows: (string | number)[][] = [
      [
        "Forge Analytics Export",
        `Range: ${dateRange === "7d" ? "Last 7 Days" : dateRange === "30d" ? "Last 30 Days" : "Last 90 Days"}`,
      ],
      [],
      ["KPI", "Value", "Change vs. prior period"],
      ...kpis.map((k) => [k.label, k.value, k.change]),
      [],
      ["Top Contributors", "Role", "Completed (tasks + approved reviews)"],
      ...topContributors.map((c) => [c.user.name, c.user.role, c.count]),
      [],
      ["Task", "Department", "Status", "Bid (hrs)", "Actual (hrs)"],
      ...filteredTasks.map((t) => [
        t.title,
        t.department,
        t.status,
        t.estimatedHours || 0,
        t.actualHours || 0,
      ]),
    ];
    const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forge-analytics-${dateRange}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      description: `Exported ${filteredTasks.length} tasks and ${topContributors.length} contributor rows as CSV.`,
    });
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Executive production dashboard
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={dateRange}
            onValueChange={(v) => setDateRange(v as DateRangeKey)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}
                >
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <div
                  className={`flex items-center gap-1 text-xs font-medium ${kpi.good ? "text-green-500" : "text-red-500"}`}
                >
                  {kpi.dir === "up" ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {kpi.change}
                </div>
              </div>
              <div className="text-3xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {kpi.label}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="production" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="production">Production Metrics</TabsTrigger>
          <TabsTrigger
            value="financials"
            disabled={!canViewFinancials}
            title={
              canViewFinancials
                ? undefined
                : "Your role doesn't include View Financials"
            }
          >
            {!canViewFinancials && <Lock className="w-3 h-3 mr-1.5" />} Bid vs
            Logged
          </TabsTrigger>
          <TabsTrigger value="timecards">Timecards & Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="production" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              {/* Bidding vs Actuals (Burn Rate) */}
              <Card className="border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                <CardHeader className="pb-3 bg-orange-500/5">
                  <CardTitle className="text-lg flex items-center gap-2 text-orange-500">
                    <Flame className="w-5 h-5" /> Bidding vs Actuals (Burn Rate)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-5">
                  {burnRateTasks.length === 0 ? (
                    <Empty className="border-0 py-4">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Flame />
                        </EmptyMedia>
                        <EmptyTitle>No time logged yet</EmptyTitle>
                        <EmptyDescription>
                          Burn rate compares logged hours against bid hours.
                          Nothing has been logged against tasks in this range.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    burnRateTasks.map((task) => {
                      const bids = task.estimatedHours || 0;
                      const actuals = task.actualHours || 0;
                      const burnRate =
                        bids > 0 ? Math.round((actuals / bids) * 100) : null;
                      const isOverBudget = actuals > bids;

                      const shot = shots.find((s) => s.id === getShotId(task));
                      const project = projects.find(
                        (p) => p.id === shot?.projectId,
                      );

                      return (
                        <div key={task.id} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <div>
                              <span className="font-medium">
                                {task.department} Task
                              </span>
                              <div className="text-[10px] text-muted-foreground">
                                {project?.name} - {shot?.name}
                              </div>
                            </div>
                            <div className="flex gap-4 items-center">
                              <span className="text-muted-foreground">
                                Bid: {bids}h
                              </span>
                              <span
                                className={
                                  isOverBudget
                                    ? "text-red-500 font-bold"
                                    : "text-green-500 font-bold"
                                }
                              >
                                Actual: {actuals}h
                              </span>
                            </div>
                          </div>
                          <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                            <div
                              className="absolute top-0 bottom-0 left-0 bg-blue-500/40 rounded-full"
                              style={{ width: `100%` }}
                            />
                            <div
                              className={`absolute top-0 bottom-0 left-0 rounded-full transition-all duration-700 ${isOverBudget ? "bg-red-500" : "bg-green-500"}`}
                              style={{
                                width: `${burnRate === null ? 0 : Math.min(burnRate, 100)}%`,
                              }}
                            />
                            {isOverBudget && (
                              <div
                                className="absolute top-0 bottom-0 right-0 bg-red-600 animate-pulse"
                                style={{
                                  width: `${burnRate === null ? 100 : Math.min(burnRate - 100, 100)}%`,
                                }}
                              />
                            )}
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">
                              Burn Rate:{" "}
                              <span
                                className={
                                  isOverBudget
                                    ? "text-red-500"
                                    : "text-foreground"
                                }
                              >
                                {burnRate === null ? "no bid hours" : `${burnRate}%`}
                              </span>
                            </span>
                            {isOverBudget ? (
                              <span className="text-red-500 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Over
                                budget by {actuals - bids}h
                              </span>
                            ) : (
                              <span className="text-green-500 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Under
                                budget by {bids - actuals}h
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {/* Delivery Trends - CSS Chart */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Delivery Trends</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Tasks due vs. tasks completed, across the selected range.
                  </p>
                </CardHeader>
                <CardContent>
                  {maxDelivery === 0 ? (
                    <Empty className="border-0 py-4">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <TrendingUp />
                        </EmptyMedia>
                        <EmptyTitle>No deliveries in this range</EmptyTitle>
                        <EmptyDescription>
                          No tasks are due or were completed in this window. Try
                          a wider date range.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <>
                      <div className="flex items-end gap-3 h-48">
                        {deliveryData.map((d, i) => (
                          <div
                            key={i}
                            className="flex-1 flex flex-col items-center gap-1"
                          >
                            <div className="flex gap-0.5 items-end h-40 w-full">
                              <div
                                className="flex-1 bg-primary/20 rounded-t-sm transition-all duration-500"
                                style={{
                                  height: `${(d.planned / maxDelivery) * 100}%`,
                                }}
                                title={`${d.planned} due`}
                              />
                              <div
                                className="flex-1 bg-primary rounded-t-sm transition-all duration-500"
                                style={{
                                  height: `${(d.actual / maxDelivery) * 100}%`,
                                }}
                                title={`${d.actual} completed`}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {d.label}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-primary/20" />{" "}
                          Due
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-primary" />{" "}
                          Completed
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Department Workload — open tasks by due date. A true capacity
                figure would need per-artist availability hours, which the
                database doesn't carry, so this counts committed work rather
                than claiming a % load. */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      Department Workload
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Open tasks by due date. Artist availability isn't tracked,
                      so this is committed work, not capacity.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                    Lighter
                    <div className="w-2.5 h-2.5 rounded bg-primary/10 border border-border" />
                    <div className="w-2.5 h-2.5 rounded bg-primary/30 border border-border" />
                    <div className="w-2.5 h-2.5 rounded bg-primary/60 border border-border" />
                    Heavier
                  </div>
                </CardHeader>
                <CardContent>
                  {departmentWorkload.peak === 0 ? (
                    <Empty className="border-0 py-4">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users />
                        </EmptyMedia>
                        <EmptyTitle>No open tasks due in this range</EmptyTitle>
                        <EmptyDescription>
                          Departments show workload once their tasks carry due
                          dates inside the selected window.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="overflow-x-auto custom-scrollbar pb-2">
                      <table className="w-full min-w-[600px] text-xs">
                        <thead>
                          <tr>
                            <th className="text-left font-medium text-muted-foreground pb-2 w-32">
                              Department
                            </th>
                            {departmentWorkload.labels.map((label) => (
                              <th
                                key={label}
                                className="text-center font-medium text-muted-foreground pb-2 w-16"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {departmentWorkload.rows.map(({ dept, weeks }) => (
                            <tr
                              key={dept.id}
                              className="border-t border-border group"
                            >
                              <td className="py-2">
                                <Link href={`/departments/${dept.id}`}>
                                  <div className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded-md -ml-1 transition-colors">
                                    <div
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: dept.color }}
                                    />
                                    <span className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                                      {dept.name}{" "}
                                      <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </span>
                                  </div>
                                </Link>
                              </td>
                              {weeks.map((count, w) => {
                                const share = count / departmentWorkload.peak;
                                const tint =
                                  count === 0
                                    ? "bg-muted/30 text-muted-foreground"
                                    : share > 0.66
                                      ? "bg-primary/60 text-foreground"
                                      : share > 0.33
                                        ? "bg-primary/30 text-foreground"
                                        : "bg-primary/10 text-foreground";
                                return (
                                  <td key={w} className="p-1">
                                    <div
                                      className={`h-8 rounded flex items-center justify-center font-mono text-[10px] border border-border transition-colors hover:border-primary/50 cursor-help ${tint}`}
                                      title={`${dept.name}, ${departmentWorkload.labels[w]}: ${count} open task${count === 1 ? "" : "s"} due`}
                                    >
                                      {count}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Review Statistics */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Review Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-6">
                    {[
                      {
                        label: "Reviews Logged",
                        value: String(reviewStats.logged),
                        sub: "in this range",
                      },
                      {
                        label: "Active Reviewers",
                        value: String(reviewStats.activeReviewers),
                        sub: "people who reviewed",
                      },
                      {
                        label: "Avg Rounds",
                        value:
                          reviewStats.avgRounds === null
                            ? "—"
                            : reviewStats.avgRounds.toFixed(1),
                        sub: "reviews per version",
                      },
                      {
                        label: "Avg Turnaround",
                        value:
                          reviewStats.logged === 0
                            ? "—"
                            : `${avgReviewTime.toFixed(1)}h`,
                        sub: "from submit to decision",
                      },
                    ].map((s, i) => (
                      <div key={i} className="text-center">
                        <div className="text-2xl font-bold">{s.value}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {s.sub}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Project Progress — real task completion per project; there is
                no risk score or forecast model behind the real data. */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Project Progress</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {projects.slice(0, 5).map((proj) => {
                    const progress =
                      projectProgress.get(proj.id) ?? NO_PROJECT_PROGRESS;
                    const endDate = proj.endDate ? new Date(proj.endDate) : null;
                    const hasEndDate =
                      endDate !== null && !Number.isNaN(endDate.getTime());
                    return (
                      <div key={proj.id} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{proj.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {progress.percent === null
                              ? "No tasks"
                              : `${progress.done}/${progress.total} tasks`}
                          </Badge>
                        </div>
                        <div className="relative h-5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="absolute top-0 bottom-0 left-0 bg-primary rounded-full"
                            style={{ width: `${progress.percent ?? 0}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>
                            {progress.percent === null
                              ? "No tasks yet"
                              : `${progress.percent}% complete`}
                          </span>
                          <span>
                            {hasEndDate
                              ? `Due ${endDate!.toLocaleDateString("en-US", {
                                  month: "short",
                                  year: "numeric",
                                })}`
                              : "No end date set"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Publishing Statistics */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    Publishing Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      {
                        label: "Total Published",
                        value: filteredPublishLogs.filter(
                          (p) => p.status === "success",
                        ).length,
                        color: "text-green-500",
                      },
                      {
                        label: "Failed",
                        value: filteredPublishLogs.filter(
                          (p) => p.status === "failed",
                        ).length,
                        color: "text-red-500",
                      },
                      {
                        label: "Validation Pass Rate",
                        value: `${publishSuccess}%`,
                        color:
                          publishSuccess > 90
                            ? "text-green-500"
                            : "text-yellow-500",
                      },
                    ].map((s, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className={`font-bold ${s.color}`}>
                          {s.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top Contributors */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5" /> Top Contributors
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topContributors.every((c) => c.count === 0) ? (
                    <Empty className="border-0 py-4">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users />
                        </EmptyMedia>
                        <EmptyTitle>No completions in this range</EmptyTitle>
                        <EmptyDescription>
                          Try a wider date range.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    topContributors.map((c, i) => (
                      <div key={c.user.id} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-4">
                          #{i + 1}
                        </span>
                        <div className="w-7 h-7 rounded-full overflow-hidden">
                          <img
                            src={c.user.avatar}
                            alt={c.user.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {c.user.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {c.user.role}
                          </div>
                        </div>
                        <span className="text-sm font-bold">
                          {c.count} tasks
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="financials" className="space-y-6 mt-0">
          {!canViewFinancials ? (
            <Card>
              <CardContent className="py-10">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Lock />
                    </EmptyMedia>
                    <EmptyTitle>Bid hours access restricted</EmptyTitle>
                    <EmptyDescription>
                      Your role doesn't include View Financials in the current
                      Roles &amp; Permissions scheme. Ask a producer or manager
                      to grant access under Settings &gt; Roles.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Flame className="text-orange-500" /> Bid vs. Logged Hours
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bid hours vs. hours logged, summed from each project's own
                    tasks. No rate card or budget is configured for this studio,
                    so there are no dollar figures to show here or on the{" "}
                    <Link href="/financials">
                      <span className="text-primary hover:underline cursor-pointer">
                        Financials dashboard
                      </span>
                    </Link>
                    .
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-muted-foreground">
                          <th className="pb-3 font-medium">Project</th>
                          <th className="pb-3 font-medium text-right">
                            Bid (hrs)
                          </th>
                          <th className="pb-3 font-medium text-right">
                            Logged (hrs)
                          </th>
                          <th className="pb-3 font-medium text-right">
                            Variance (hrs)
                          </th>
                          <th className="pb-3 font-medium text-right">
                            Tasks Done
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {projects.map((proj) => {
                          const hours = projectHours.get(proj.id) ?? {
                            estimated: 0,
                            actual: 0,
                          };
                          const progress =
                            projectProgress.get(proj.id) ?? NO_PROJECT_PROGRESS;
                          const hasLogged = hours.actual > 0;
                          const variance = hours.estimated - hours.actual;

                          return (
                            <tr
                              key={proj.id}
                              className="hover:bg-muted/30 transition-colors"
                            >
                              <td className="py-4 font-medium">{proj.name}</td>
                              <td className="py-4 text-right tabular-nums">
                                {hours.estimated > 0
                                  ? `${hours.estimated}h`
                                  : "—"}
                              </td>
                              <td className="py-4 text-right tabular-nums text-muted-foreground">
                                {hasLogged ? `${hours.actual}h` : "No time logged"}
                              </td>
                              <td
                                className={`py-4 text-right tabular-nums ${hasLogged && variance < 0 ? "text-red-500" : "text-muted-foreground"}`}
                              >
                                {hasLogged
                                  ? `${variance > 0 ? "+" : ""}${variance}h`
                                  : "—"}
                              </td>
                              <td className="py-4 text-right tabular-nums">
                                {progress.percent === null
                                  ? "No tasks"
                                  : `${progress.done} / ${progress.total}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="timecards" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Clock className="text-blue-500 w-5 h-5" /> Artist Timecards
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="pb-3 font-medium">Artist</th>
                      <th className="pb-3 font-medium">Department</th>
                      <th className="pb-3 font-medium text-center">Status</th>
                      <th className="pb-3 font-medium text-right">
                        Today (hrs)
                      </th>
                      <th className="pb-3 font-medium text-right">
                        Session (hrs)
                      </th>
                      <th className="pb-3 font-medium text-right">
                        Utilization
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {users.map((user) => {
                      const dept = departments.find(
                        (d) => d.id === user.departmentId,
                      );

                      // users.punched_in_at is real backend state for every
                      // user now (GET /users), not just whoever's logged in
                      // -- see hooks/useUsers.ts's usePunchIn/usePunchOut.
                      const mockStatus = user.punchedInAt
                        ? "punched-in"
                        : "offline";
                      const punchedInAt = user.punchedInAt ?? undefined;

                      // Elapsed time since punch-in is real for every row.
                      // There's still no full per-user daily-log aggregate
                      // backend (only per-task GET /daily-logs?taskId=),
                      // so "Today"/"Session" both show this same
                      // punched-in-session figure rather than a real
                      // studio-wide hours total -- the column is labeled
                      // "Session (hrs)", not "This Week", so it isn't
                      // presented as something it isn't.
                      const sessionHours = user.punchedInAt
                        ? hoursSincePunchIn(user.punchedInAt)
                        : null;
                      const todayHrs = sessionHours?.toFixed(1) ?? null;
                      const weekHrs = sessionHours?.toFixed(1) ?? null;
                      const util =
                        weekHrs !== null
                          ? Math.round((Number(weekHrs) / 40) * 100)
                          : null;
                      const isOver = util !== null && util > 100;

                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="py-4 font-medium flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                              <img
                                src={user.avatar}
                                alt={user.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <div>{user.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {user.role}
                              </div>
                            </div>
                          </td>
                          <td className="py-4">
                            <Badge variant="secondary" className="text-[10px]">
                              {dept?.name || user.departmentId}
                            </Badge>
                          </td>
                          <td className="py-4 text-center">
                            <Badge
                              variant="outline"
                              className={
                                mockStatus === "punched-in"
                                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                                  : "bg-muted text-muted-foreground"
                              }
                            >
                              {mockStatus === "punched-in"
                                ? `PUNCHED IN${punchedInAt ? ` (${new Date(punchedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}`
                                : "OFFLINE"}
                            </Badge>
                          </td>
                          <td className="py-4 text-right tabular-nums font-medium">
                            {todayHrs !== null ? `${todayHrs}h` : "—"}
                          </td>
                          <td className="py-4 text-right tabular-nums">
                            {weekHrs !== null ? `${weekHrs}h` : "—"}
                          </td>
                          <td className="py-4 text-right">
                            {util !== null ? (
                              <Badge
                                variant="outline"
                                className={
                                  isOver
                                    ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                                    : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                }
                              >
                                {util}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
