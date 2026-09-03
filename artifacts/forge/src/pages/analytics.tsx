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
import { Project, isTaskDone } from "@/data/mockData";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import { useProjectStore } from "@/store/projects";
import { useTasksStore } from "@/store/tasks";
import { useReviewStore } from "@/store/reviews";
import { usePublishingStore } from "@/store/publishing";
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
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useCapability } from "@/hooks/use-capability";
import { hashString, seededFraction } from "@/lib/seededMock";
import { getAssigneeId, getShotId } from "@/lib/taskShape";

// Fictional "today" this studio's books are closed against - matches the
// anchor financials.tsx uses. The mock dataset (task/review/publish
// timestamps) lives in and around mid-2024, so the date-range filter below
// is anchored there too instead of drifting with the real-world calendar.
const MOCK_TODAY = new Date("2024-10-15");

const DATE_RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;
type DateRangeKey = keyof typeof DATE_RANGE_DAYS;

function withinRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/**
 * Deterministic per-project bid vs. actual hours + rate for the Bid Margins
 * table. Mirrors the spend-ratio model in financials.tsx's getProjectFinancials:
 * a stable per-project hash seeds an hour estimate, and a risk/progress-driven
 * ratio (with a small per-project jitter) decides how actuals diverge from the
 * bid - so every project lands on its own curve instead of a shared placeholder.
 * hashString/seededFraction live in src/lib/seededMock.ts, shared with
 * financials.tsx so the two pages' bid-vs-actual math can't drift apart.
 */
function getProjectBidMargin(p: Project): {
  bids: number;
  actuals: number;
  rate: number;
} {
  const seed = hashString(p.id);
  const bids = 150 + (seed % 1200); // stable bid-hours estimate per project, 150-1349h
  const jitter = seededFraction(seed, 41); // stable per-project value in [0,1)

  const progressFactor = p.progress / 100;
  const riskPremium = (p.riskScore / 100) * 0.4; // riskier shows tend to burn hotter
  const jitterSpread = (jitter - 0.5) * 0.3; // +/-15%, keeps similar-risk projects visually distinct

  let burnRatio = progressFactor * (0.8 + riskPremium) + jitterSpread;
  if (p.status === "COMPLETE") burnRatio = 0.95 + jitter * 0.25; // wrapped shows land near/over their bid
  burnRatio = Math.max(0.1, Math.min(1.5, burnRatio));

  const actuals = Math.max(1, Math.round(bids * burnRatio));
  const rate = 75 + (seed % 21); // stable $75-95/h per project

  return { bids, actuals, rate };
}

/**
 * Mirrors the header clock's punched-in state (TimeClockWidget reads/writes a
 * per-user 'forge-punch-in-time-<userId>' localStorage key - see STORAGE_PREFIX
 * in TimeClockWidget.tsx) so the logged-in user's own Timecards row never
 * contradicts the header's live PUNCHED IN indicator.
 */
function usePunchedInSession(userId: string | undefined): {
  hours: number;
  since: string | null;
} {
  const [session, setSession] = useState<{
    hours: number;
    since: string | null;
  }>({ hours: 0, since: null });

  useEffect(() => {
    if (!userId) {
      setSession({ hours: 0, since: null });
      return;
    }
    const compute = () => {
      const startTime = localStorage.getItem(`forge-punch-in-time-${userId}`);
      if (!startTime) {
        setSession({ hours: 0, since: null });
        return;
      }
      const startMs = parseInt(startTime, 10);
      setSession({
        hours: Math.max(0, (Date.now() - startMs) / 3600000),
        since: new Date(startMs).toISOString(),
      });
    };
    compute();
    const interval = setInterval(compute, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  return session;
}

export default function Analytics() {
  const { toast } = useToast();
  const { currentUser } = useAuthStore();
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const projects = useProjectStore((s) => s.projects);
  const tasks = useTasksStore((s) => s.tasks);
  const reviews = useReviewStore((s) => s.reviews);
  const publishLogs = usePublishingStore((s) => s.logs);
  const shots = useShotStore((s) => s.shots);
  const punchedInSession = usePunchedInSession(currentUser?.id);
  const canViewFinancials = useCapability("view_financials");

  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");

  // Current period is [MOCK_TODAY - N days, MOCK_TODAY]; previous period is
  // the N days immediately before that, so every KPI's trend arrow is a real
  // comparison against the prior period of equal length instead of a
  // hardcoded string.
  const { currentStart, previousStart, previousEnd } = useMemo(() => {
    const days = DATE_RANGE_DAYS[dateRange];
    const curStart = new Date(MOCK_TODAY);
    curStart.setDate(curStart.getDate() - days);
    // 1ms before curStart, not curStart itself - withinRange is inclusive on
    // both ends, so an end equal to the current period's start would let any
    // record landing exactly on that boundary instant count in both periods.
    const prevEnd = new Date(curStart.getTime() - 1);
    const prevStart = new Date(curStart);
    prevStart.setDate(prevStart.getDate() - days);
    return {
      currentStart: curStart,
      previousStart: prevStart,
      previousEnd: prevEnd,
    };
  }, [dateRange]);

  const filteredTasks = useMemo(
    () =>
      tasks.filter((t) => withinRange(t.createdAt, currentStart, MOCK_TODAY)),
    [tasks, currentStart],
  );
  const filteredReviews = useMemo(
    () =>
      reviews.filter((r) => withinRange(r.createdAt, currentStart, MOCK_TODAY)),
    [reviews, currentStart],
  );
  const filteredPublishLogs = useMemo(
    () =>
      publishLogs.filter((p) =>
        withinRange(p.publishedAt, currentStart, MOCK_TODAY),
      ),
    [publishLogs, currentStart],
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
    const done = tasks.filter((t) => isTaskDone(t.status)).length;
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
      if (assigneeId && isTaskDone(t.status))
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

  // Generate mock chart data
  const deliveryData = [
    { week: "W1", planned: 12, actual: 10 },
    { week: "W2", planned: 15, actual: 14 },
    { week: "W3", planned: 18, actual: 20 },
    { week: "W4", planned: 22, actual: 19 },
    { week: "W5", planned: 25, actual: 23 },
    { week: "W6", planned: 20, actual: 22 },
    { week: "W7", planned: 28, actual: 26 },
    { week: "W8", planned: 30, actual: 28 },
  ];

  const maxDelivery = Math.max(
    ...deliveryData.flatMap((d) => [d.planned, d.actual]),
  );

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
            {!canViewFinancials && <Lock className="w-3 h-3 mr-1.5" />} Bid
            Margins
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
                  {filteredTasks.length === 0 ? (
                    <Empty className="border-0 py-4">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Flame />
                        </EmptyMedia>
                        <EmptyTitle>No tasks in this range</EmptyTitle>
                        <EmptyDescription>
                          Try a wider date range.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    filteredTasks.slice(0, 5).map((task) => {
                      const bids = task.estimatedHours || 40;
                      const actuals =
                        task.actualHours || (hashString(task.id) % 40) + 10; // Deterministic fallback if undefined
                      const burnRate = Math.round((actuals / bids) * 100);
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
                              style={{ width: `${Math.min(burnRate, 100)}%` }}
                            />
                            {isOverBudget && (
                              <div
                                className="absolute top-0 bottom-0 right-0 bg-red-600 animate-pulse"
                                style={{
                                  width: `${Math.min(burnRate - 100, 100)}%`,
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
                                {burnRate}%
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
                </CardHeader>
                <CardContent>
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
                          />
                          <div
                            className="flex-1 bg-primary rounded-t-sm transition-all duration-500"
                            style={{
                              height: `${(d.actual / maxDelivery) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {d.week}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-primary/20" />{" "}
                      Planned
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-primary" /> Actual
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Department Capacity Heatmap */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Department Capacity</CardTitle>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded bg-green-500/20 border border-green-500/50" />{" "}
                      Available
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded bg-yellow-500/20 border border-yellow-500/50" />{" "}
                      Heavy
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded bg-red-500/20 border border-red-500/50" />{" "}
                      Overloaded
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto custom-scrollbar pb-2">
                    <table className="w-full min-w-[600px] text-xs">
                      <thead>
                        <tr>
                          <th className="text-left font-medium text-muted-foreground pb-2 w-32">
                            Department
                          </th>
                          {["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"].map(
                            (w) => (
                              <th
                                key={w}
                                className="text-center font-medium text-muted-foreground pb-2 w-16"
                              >
                                {w}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {departments.slice(0, 6).map((dept, i) => {
                          // Deterministic capacity curve per week (0-150%), seeded per dept+week
                          const baseLoad = [80, 95, 60, 110, 40, 85][i];
                          const weekLoads = Array.from({ length: 8 }).map(
                            (_, w) => {
                              return Math.max(
                                0,
                                baseLoad +
                                  Math.sin(w) * 30 +
                                  seededFraction(i, w) * 20,
                              );
                            },
                          );

                          return (
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
                              {weekLoads.map((load, w) => {
                                let color =
                                  "bg-green-500/10 text-green-600 border-green-500/30";
                                if (load > 110)
                                  color =
                                    "bg-red-500/10 text-red-600 border-red-500/30";
                                else if (load > 85)
                                  color =
                                    "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
                                return (
                                  <td key={w} className="p-1">
                                    <div
                                      className={`h-8 rounded flex items-center justify-center font-mono text-[10px] border transition-colors hover:border-primary/50 cursor-help ${color}`}
                                      title={`${dept.name} Week ${w + 1}: ${Math.round(load)}% Capacity`}
                                    >
                                      {Math.round(load)}%
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                      { label: "Avg Rounds", value: "1.6", sub: "per shot" },
                      {
                        label: "First-Pass Rate",
                        value: "42%",
                        sub: "approved on v001",
                      },
                      {
                        label: "Avg Turnaround",
                        value: "4.2h",
                        sub: "from submit to decision",
                      },
                      {
                        label: "Active Reviewers",
                        value: "12",
                        sub: "this week",
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
              {/* Project Forecast */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Project Forecast</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {projects.slice(0, 5).map((proj) => {
                    const risk = proj.riskScore;
                    return (
                      <div key={proj.id} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{proj.name}</span>
                          <Badge
                            variant={
                              risk > 50
                                ? "destructive"
                                : risk > 30
                                  ? "secondary"
                                  : "outline"
                            }
                            className="text-[10px]"
                          >
                            {risk > 50
                              ? "High Risk"
                              : risk > 30
                                ? "Medium"
                                : "Low Risk"}
                          </Badge>
                        </div>
                        <div className="relative h-5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="absolute top-0 bottom-0 left-0 bg-primary/30 rounded-full"
                            style={{
                              width: `${Math.min(proj.progress + 20, 100)}%`,
                            }}
                          />
                          <div
                            className="absolute top-0 bottom-0 left-0 bg-primary rounded-full"
                            style={{ width: `${proj.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{proj.progress}% complete</span>
                          <span>
                            Due{" "}
                            {new Date(proj.dueDate).toLocaleDateString(
                              "en-US",
                              { month: "short", year: "numeric" },
                            )}
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
                        label: "Avg Duration",
                        value: (() => {
                          if (filteredPublishLogs.length === 0) return "—";
                          const totalSeconds = filteredPublishLogs.reduce(
                            (sum, p) => {
                              const match = p.duration.match(
                                /(\d+)m\s*(\d+)s/,
                              );
                              if (!match) return sum;
                              return (
                                sum +
                                Number(match[1]) * 60 +
                                Number(match[2])
                              );
                            },
                            0,
                          );
                          const avgSeconds = Math.round(
                            totalSeconds / filteredPublishLogs.length,
                          );
                          return `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`;
                        })(),
                        color: "text-blue-500",
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
                    <EmptyTitle>Bid margins access restricted</EmptyTitle>
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
                    <Flame className="text-orange-500" /> Bid vs. Delivered
                    Profitability
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Won bid hours vs. hours actually delivered, per project. For
                    live budget spend and burn-rate tracking, see the{" "}
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
                            Estimated Bid (hrs)
                          </th>
                          <th className="pb-3 font-medium text-right">
                            Actual Burn (hrs)
                          </th>
                          <th className="pb-3 font-medium text-right">
                            Avg Rate ($)
                          </th>
                          <th className="pb-3 font-medium text-right">
                            Bid Value ($)
                          </th>
                          <th className="pb-3 font-medium text-right">
                            Actual Cost ($)
                          </th>
                          <th className="pb-3 font-medium text-right">
                            Profit Margin
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {projects.map((proj) => {
                          const { bids, actuals, rate } =
                            getProjectBidMargin(proj);
                          const bidValue = bids * rate;
                          const actualCost = actuals * rate;
                          const profit = bidValue - actualCost;
                          const margin = Math.round((profit / bidValue) * 100);
                          const isLoss = margin < 0;

                          return (
                            <tr
                              key={proj.id}
                              className="hover:bg-muted/30 transition-colors"
                            >
                              <td className="py-4 font-medium">{proj.name}</td>
                              <td className="py-4 text-right tabular-nums">
                                {bids}h
                              </td>
                              <td className="py-4 text-right tabular-nums text-muted-foreground">
                                {actuals}h
                              </td>
                              <td className="py-4 text-right tabular-nums">
                                ${rate}/h
                              </td>
                              <td className="py-4 text-right tabular-nums">
                                ${bidValue.toLocaleString()}
                              </td>
                              <td className="py-4 text-right tabular-nums">
                                ${actualCost.toLocaleString()}
                              </td>
                              <td className="py-4 text-right">
                                <Badge
                                  variant="outline"
                                  className={
                                    isLoss
                                      ? "bg-red-500/10 text-red-500 border-red-500/20"
                                      : "bg-green-500/10 text-green-500 border-green-500/20"
                                  }
                                >
                                  {isLoss ? "" : "+"}
                                  {margin}%
                                </Badge>
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
                      const isCurrentUser = currentUser?.id === user.id;

                      // No real studio-wide time-log aggregation backend exists yet,
                      // so only the logged-in user's own row has a real punched-in
                      // status (mirrored from the header clock via usePunchedInSession
                      // above) - which means this row must actually check
                      // punchedInSession.since, not just identity, or a currentUser who
                      // is punched OUT would still show PUNCHED IN here. Every other
                      // row gets an honest "unknown" placeholder instead of a fabricated
                      // punched-in/offline status.
                      const mockStatus = isCurrentUser
                        ? punchedInSession.since
                          ? "punched-in"
                          : "offline"
                        : "unknown";
                      const punchedInAt =
                        mockStatus === "punched-in" && isCurrentUser
                          ? punchedInSession.since!
                          : undefined;

                      // No real studio-wide time-log aggregation backend
                      // exists yet (only per-task daily-logs via
                      // GET /daily-logs?taskId=/?userId=, not a full
                      // per-user aggregate) — so only the logged-in user's
                      // own row has real hours, mirrored from the header
                      // clock's punched-in session above. Every other row
                      // shows an honest "no data" placeholder instead of
                      // invented hours.
                      //
                      // sessionHrs is the same punched-in-session figure as
                      // todayHrs (there's no real weekly aggregate to show) —
                      // the column is labeled "Session (hrs)", not "This
                      // Week", so it isn't presented as something it isn't.
                      const todayHrs = isCurrentUser
                        ? punchedInSession.hours.toFixed(1)
                        : null;
                      const weekHrs = isCurrentUser
                        ? punchedInSession.hours.toFixed(1)
                        : null;
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
                                : mockStatus === "unknown"
                                  ? "NO DATA"
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
