import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PalmtreeIcon, Users2, TrendingUp } from "lucide-react";
import { USERS, DEPARTMENTS, LEAVE_EVENTS } from "@/data/mockData";
import { useTasksStore } from "@/store/tasks";
import { cn } from "@/lib/utils";
import {
  REFERENCE_DATE,
  TIMELINE_DAYS,
  overlapDays,
  getTaskWindow,
} from "./utils";
import { ScopeTrace } from "@/components/shared/ScopeTrace";

const PIPELINES = ["PROD", "3D", "VFX", "2D"] as const;

const WEEK_LEN = 7;

function bucketRanges() {
  const buckets: { start: string; end: string; label: string }[] = [];
  const cursor = new Date(REFERENCE_DATE);
  let remaining = TIMELINE_DAYS;
  while (remaining > 0) {
    const len = Math.min(WEEK_LEN, remaining);
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + len - 1);
    buckets.push({
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
      label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    });
    cursor.setDate(cursor.getDate() + len);
    remaining -= len;
  }
  return buckets;
}

function utilColor(pct: number) {
  return pct > 100
    ? "bg-red-500"
    : pct > 85
      ? "bg-yellow-500"
      : "bg-emerald-500";
}
function utilText(pct: number) {
  return pct > 100
    ? "text-red-500"
    : pct > 85
      ? "text-yellow-500"
      : "text-emerald-500";
}

export default function CapacityForecast() {
  const tasks = useTasksStore((s) => s.tasks);
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");

  const buckets = useMemo(() => bucketRanges(), []);
  const studioUsers = useMemo(
    () => USERS.filter((u) => u.role !== "client"),
    [],
  );

  // --- Studio-wide weekly chart data ---------------------------------------
  const chartData = useMemo(() => {
    return buckets.map((bucket) => {
      const bucketLen = overlapDays(
        bucket.start,
        bucket.end,
        bucket.start,
        bucket.end,
      );
      const headcountDays = studioUsers.length * bucketLen;

      const leaveDays = LEAVE_EVENTS.reduce((sum, leave) => {
        if (!studioUsers.some((u) => u.id === leave.userId)) return sum;
        return (
          sum + overlapDays(bucket.start, bucket.end, leave.start, leave.end)
        );
      }, 0);

      const bookedDays = tasks.reduce((sum, task) => {
        if (
          !task.assigneeId ||
          !studioUsers.some((u) => u.id === task.assigneeId)
        )
          return sum;
        const { startDate, duration } = getTaskWindow(task);
        const endDate = task.dueDate;
        const overlap = overlapDays(
          bucket.start,
          bucket.end,
          startDate,
          endDate,
        );
        return sum + Math.min(overlap, duration);
      }, 0);

      const available = Math.max(0, headcountDays - leaveDays);

      return {
        label: bucket.label,
        Booked: bookedDays,
        Leave: leaveDays,
        Available: available,
      };
    });
  }, [buckets, studioUsers, tasks]);

  // --- Department breakdown (next 2 weeks) ---------------------------------
  const deptWindow =
    buckets.length > 1
      ? { start: buckets[0].start, end: buckets[1].end }
      : { start: buckets[0].start, end: buckets[0].end };

  const departments = useMemo(() => {
    return DEPARTMENTS.filter(
      (d) => pipelineFilter === "all" || d.pipeline === pipelineFilter,
    )
      .map((dept) => {
        const deptUsers = studioUsers.filter((u) => u.departmentId === dept.id);
        const windowLen = overlapDays(
          deptWindow.start,
          deptWindow.end,
          deptWindow.start,
          deptWindow.end,
        );
        const headcountDays = deptUsers.length * windowLen;

        const leaveDays = LEAVE_EVENTS.reduce((sum, leave) => {
          if (!deptUsers.some((u) => u.id === leave.userId)) return sum;
          return (
            sum +
            overlapDays(
              deptWindow.start,
              deptWindow.end,
              leave.start,
              leave.end,
            )
          );
        }, 0);

        const bookedDays = tasks.reduce((sum, task) => {
          if (!deptUsers.some((u) => u.id === task.assigneeId)) return sum;
          const { startDate, duration } = getTaskWindow(task);
          const overlap = overlapDays(
            deptWindow.start,
            deptWindow.end,
            startDate,
            task.dueDate,
          );
          return sum + Math.min(overlap, duration);
        }, 0);

        const available = Math.max(0, headcountDays - leaveDays);
        const utilization =
          available > 0
            ? Math.round((bookedDays / available) * 100)
            : bookedDays > 0
              ? 999
              : 0;

        return {
          dept,
          headcount: deptUsers.length,
          headcountDays,
          leaveDays,
          bookedDays,
          available,
          utilization,
        };
      })
      .filter((d) => d.headcount > 0)
      .sort((a, b) => b.utilization - a.utilization);
  }, [pipelineFilter, studioUsers, tasks, deptWindow.start, deptWindow.end]);

  // --- Per-department utilization trend, one point per week bucket --------
  // Same booked/leave/available math as the department cards above, just run
  // across every week in `buckets` instead of only the next-2-weeks window,
  // so each card can show where utilization has been heading. Feeds the
  // ScopeTrace sparkline in each department card.
  const departmentTrends = useMemo(() => {
    const map = new Map<string, number[]>();
    DEPARTMENTS.forEach((dept) => {
      const deptUsers = studioUsers.filter((u) => u.departmentId === dept.id);
      if (deptUsers.length === 0) return;
      const series = buckets.map((bucket) => {
        const bucketLen = overlapDays(
          bucket.start,
          bucket.end,
          bucket.start,
          bucket.end,
        );
        const headcountDays = deptUsers.length * bucketLen;

        const leaveDays = LEAVE_EVENTS.reduce((sum, leave) => {
          if (!deptUsers.some((u) => u.id === leave.userId)) return sum;
          return (
            sum + overlapDays(bucket.start, bucket.end, leave.start, leave.end)
          );
        }, 0);

        const bookedDays = tasks.reduce((sum, task) => {
          if (!deptUsers.some((u) => u.id === task.assigneeId)) return sum;
          const { startDate, duration } = getTaskWindow(task);
          const overlap = overlapDays(
            bucket.start,
            bucket.end,
            startDate,
            task.dueDate,
          );
          return sum + Math.min(overlap, duration);
        }, 0);

        const available = Math.max(0, headcountDays - leaveDays);
        return available > 0
          ? Math.min(150, (bookedDays / available) * 100)
          : bookedDays > 0
            ? 150
            : 0;
      });
      map.set(dept.id, series);
    });
    return map;
  }, [buckets, studioUsers, tasks]);

  const upcomingLeave = useMemo(() => {
    return LEAVE_EVENTS.filter((l) => l.end >= buckets[0].start)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 8);
  }, [buckets]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="border-b border-border bg-card/50 px-6 py-3 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Studio Capacity Forecast</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Headcount-days available vs. booked, leave subtracted &middot;{" "}
            {buckets.length} week window from{" "}
            {new Date(REFERENCE_DATE).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All Pipelines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pipelines</SelectItem>
            {PIPELINES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" /> Studio
              Headcount-Days
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "person-days",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 11,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="Booked"
                  stackId="load"
                  fill="hsl(217 91% 60%)"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="Leave"
                  stackId="load"
                  fill="hsl(0 72% 51%)"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="Available"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Capacity Ceiling"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Users2 className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">
                Department Availability &middot; next 2 weeks
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {departments.map(
                (
                  {
                    dept,
                    headcount,
                    bookedDays,
                    leaveDays,
                    available,
                    utilization,
                  },
                  i,
                ) => (
                  <motion.div
                    key={dept.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.02 }}
                  >
                    <Card className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: dept.color }}
                          />
                          <span className="text-sm font-medium truncate">
                            {dept.name}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0"
                        >
                          {headcount} people
                        </Badge>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-1.5">
                        <motion.div
                          className={cn(
                            "h-full rounded-full",
                            utilColor(utilization),
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(utilization, 100)}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span
                          className={cn(
                            "font-mono font-bold",
                            utilText(utilization),
                          )}
                        >
                          {utilization}%
                        </span>
                        <span>
                          {bookedDays}d booked &middot; {leaveDays}d leave
                          &middot; {available}d avail.
                        </span>
                      </div>
                      {departmentTrends.has(dept.id) && (
                        <div
                          className="h-5 w-full mt-1.5"
                          title={`Utilization trend across the ${buckets.length}-week window`}
                        >
                          <ScopeTrace data={departmentTrends.get(dept.id)!} />
                        </div>
                      )}
                    </Card>
                  </motion.div>
                ),
              )}
              {departments.length === 0 && (
                <div className="col-span-2 text-sm text-muted-foreground text-center py-8">
                  No departments match this pipeline.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <PalmtreeIcon className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">Upcoming Leave</h4>
            </div>
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                {upcomingLeave.map((leave) => {
                  const user = USERS.find((u) => u.id === leave.userId);
                  return (
                    <div
                      key={leave.id}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{user?.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {leave.reason}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize"
                        >
                          {leave.type}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {new Date(leave.start).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          {leave.end !== leave.start &&
                            ` – ${new Date(leave.end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {upcomingLeave.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No leave scheduled in this window.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
