import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { isTaskDone } from "@/data/mockData";
import { normalizeTaskStatus } from "@/lib/trackingStatus";
import { useTasksStore } from "@/store/tasks";
import { useProjectStore } from "@/store/projects";
import { useDepartmentStore } from "@/store/departments";
import { useUserStore } from "@/store/users";
import { DollarSign, Clock, Users, Briefcase, ListTodo, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion, animate } from "framer-motion";
import { useCapability } from "@/hooks/use-capability";

// ============================================================================
// This page used to derive every dollar figure from `budget`, `progress` and
// `riskScore` — none of which exist on the real projects table — plus a
// per-project seeded jitter, anchored to a hardcoded "today". There is no
// budget, rate card or cost data anywhere in the database, so cost, burn rate
// and margin cannot be shown at all. What remains here is only what tracked
// production data actually supports: task counts, bid hours and logged hours.
// ============================================================================

// --- Count-up number reveal --------------------------------------------------

function useCountUp(target: number, duration = 1.1) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, target, {
      duration,
      ease: "easeOut",
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [target, duration]);
  return display;
}

function CountUp({
  value,
  format,
  duration,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const display = useCountUp(value, duration);
  return <>{format(display)}</>;
}

export default function FinancialDashboard() {
  const tasks = useTasksStore((state) => state.tasks);
  const projects = useProjectStore((s) => s.projects);
  const departments = useDepartmentStore((s) => s.departments);
  const users = useUserStore((s) => s.users);
  const canViewFinancials = useCapability("view_financials");

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status !== "COMPLETE"),
    [projects],
  );

  const { doneTasks, bidHours, loggedHours } = useMemo(() => {
    let done = 0;
    let bid = 0;
    let logged = 0;
    tasks.forEach((t) => {
      if (isTaskDone(normalizeTaskStatus(t.status))) done += 1;
      bid += t.estimatedHours || 0;
      logged += t.actualHours || 0;
    });
    return { doneTasks: done, bidHours: bid, loggedHours: logged };
  }, [tasks]);

  // Bid vs. logged hours per department, straight off the tasks' own
  // estimated/actual hour columns — the only cost-adjacent numbers that exist.
  const departmentHours = useMemo(() => {
    return departments.slice(0, 6).map((d) => {
      const deptTasks = tasks.filter((t) => t.department === d.name);
      const estimated = deptTasks.reduce(
        (acc, t) => acc + (t.estimatedHours || 0),
        0,
      );
      const actual = deptTasks.reduce((acc, t) => acc + (t.actualHours || 0), 0);
      return {
        ...d,
        estimated,
        actual,
        percent: estimated > 0 ? (actual / estimated) * 100 : null,
      };
    });
  }, [tasks, departments]);

  // Leadership passes the coarse route-level LeadershipGuard, but not every
  // leadership role carries view_financials in the real, editable Roles &
  // Permissions matrix (e.g. supervisor/lead can lead a show without seeing
  // its budget) - gate the dashboard itself on the specific capability.
  if (!canViewFinancials) {
    return (
      <div className="p-8 h-[calc(100vh-3.5rem)] overflow-auto bg-background text-foreground flex items-center justify-center">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lock />
            </EmptyMedia>
            <EmptyTitle>Financials access restricted</EmptyTitle>
            <EmptyDescription>
              Your role doesn't include View Financials in the current Roles
              &amp; Permissions scheme. Ask a producer or manager to grant
              access under Settings &gt; Roles.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const summaryCards = [
    {
      label: "Projects",
      icon: Briefcase,
      iconClass: "text-blue-500",
      value: projects.length,
      format: (n: number) => Math.round(n).toString(),
      sub: `${activeProjects.length} active`,
    },
    {
      label: "Tracked Tasks",
      icon: ListTodo,
      iconClass: "text-emerald-500",
      value: tasks.length,
      format: (n: number) => Math.round(n).toString(),
      sub: `${doneTasks} complete`,
    },
    {
      label: "Bid Hours",
      icon: Clock,
      iconClass: "text-amber-500",
      value: bidHours,
      format: (n: number) => `${Math.round(n)}h`,
      sub: "estimated across all tasks",
    },
    {
      label: "Headcount",
      icon: Users,
      iconClass: "text-purple-500",
      value: users.length,
      format: (n: number) => Math.round(n).toString(),
      sub: `${departments.length} departments`,
    },
  ];

  return (
    <div className="p-8 h-[calc(100vh-3.5rem)] overflow-auto bg-background text-foreground">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Financial Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Production figures that are actually tracked. Cost reporting needs
          budgets and rates, which aren't set up yet.
        </p>
      </div>

      <Card className="bg-card border-border mb-8">
        <CardContent className="py-8">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <DollarSign />
              </EmptyMedia>
              <EmptyTitle>No financial data configured</EmptyTitle>
              <EmptyDescription>
                This studio has no project budgets, rate card or cost records in
                the system, so spend, burn rate, remaining budget and margin
                can't be reported. Once budgets and rates are configured, those
                figures will appear here. Everything below is drawn from tracked
                production data only.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {summaryCards.map((card) => (
          <motion.div
            key={card.label}
            whileHover={{ y: -3 }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
          >
            <Card className="bg-card border-border transition-colors hover:border-primary/40 h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <card.icon className={`h-4 w-4 ${card.iconClass}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground tabular-nums">
                  <CountUp
                    value={card.value}
                    format={card.format}
                    duration={0.6}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Department Hours</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Hours logged against hours bid, per department.
            </p>
          </CardHeader>
          <CardContent>
            {loggedHours === 0 ? (
              <Empty className="border-0 py-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Clock />
                  </EmptyMedia>
                  <EmptyTitle>No time logged yet</EmptyTitle>
                  <EmptyDescription>
                    Departments have {bidHours}h bid across their tasks, but no
                    daily logs have been recorded against them.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-4">
                {departmentHours.map((d, i) => (
                  <motion.div
                    key={d.id}
                    className="flex items-center gap-4"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: i * 0.05,
                      ease: "easeOut",
                    }}
                  >
                    <div className="w-24 text-sm font-medium text-muted-foreground truncate">
                      {d.name}
                    </div>
                    <div
                      className="flex-1 bg-muted h-4 rounded overflow-hidden"
                      title={`${d.actual}h logged / ${d.estimated}h bid`}
                    >
                      <motion.div
                        className={`h-full ${(d.percent ?? 0) > 100 ? "bg-red-500/80" : (d.percent ?? 0) > 80 ? "bg-orange-500/80" : "bg-blue-500/80"}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(d.percent ?? 0, 100)}%` }}
                        transition={{
                          duration: 0.8,
                          delay: i * 0.05,
                          ease: "easeOut",
                        }}
                      />
                    </div>
                    <div className="w-16 text-right text-xs text-muted-foreground font-mono tabular-nums">
                      {d.percent === null ? "—" : `${Math.round(d.percent)}%`}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Project Delivery</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Scheduled dates, as recorded on each project.
            </p>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <Empty className="border-0 py-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Briefcase />
                  </EmptyMedia>
                  <EmptyTitle>No projects yet</EmptyTitle>
                  <EmptyDescription>
                    Projects will show up here once one exists.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-4">
                {projects.map((p) => {
                  const start = p.startDate ? new Date(p.startDate) : null;
                  const end = p.endDate ? new Date(p.endDate) : null;
                  const fmt = (d: Date | null) =>
                    d && !Number.isNaN(d.getTime())
                      ? d.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : null;
                  const startLabel = fmt(start);
                  const endLabel = fmt(end);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 text-sm border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <span className="font-medium text-foreground truncate">
                        {p.name}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {startLabel || endLabel
                          ? `${startLabel ?? "—"} → ${endLabel ?? "—"}`
                          : "No dates set"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Bidding vs Actual (Task-wise)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Bid hours come from each task's estimate; actual hours come from
              time logged against it.
            </p>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <Empty className="border-0 py-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ListTodo />
                  </EmptyMedia>
                  <EmptyTitle>No tasks yet</EmptyTitle>
                  <EmptyDescription>
                    Bid vs. actual figures will appear here once tasks exist.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                {loggedHours === 0 && (
                  <p className="text-xs text-muted-foreground mb-3">
                    No time has been logged against any task yet, so every
                    actual figure below is blank rather than estimated.
                  </p>
                )}
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="h-10 px-4 text-left font-medium w-[40%]">
                          Task
                        </th>
                        <th className="h-10 px-4 text-left font-medium">
                          Department
                        </th>
                        <th className="h-10 px-4 text-left font-medium">
                          Status
                        </th>
                        <th className="h-10 px-4 text-right font-medium">
                          Bid (hrs)
                        </th>
                        <th className="h-10 px-4 text-right font-medium">
                          Actual (hrs)
                        </th>
                        <th className="h-10 px-4 text-right font-medium">
                          Variance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tasks.slice(0, 10).map((task, i) => {
                        const bidHrs = task.estimatedHours || 0;
                        const actualHrs = task.actualHours || 0;
                        const variance = bidHrs - actualHrs;
                        const isOverBudget = actualHrs > bidHrs;
                        const stage = normalizeTaskStatus(task.status);

                        return (
                          <motion.tr
                            key={task.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.3,
                              delay: i * 0.03,
                              ease: "easeOut",
                            }}
                            className="hover:bg-muted/50 transition-colors"
                          >
                            <td className="p-4">
                              <div className="font-medium text-foreground">
                                {task.title}
                              </div>
                            </td>
                            <td className="p-4 text-muted-foreground">
                              {task.department}
                            </td>
                            <td className="p-4">
                              <span
                                className={`px-2 py-1 rounded text-[10px] uppercase font-semibold ${
                                  isTaskDone(stage)
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : stage === "in-progress"
                                      ? "bg-amber-500/10 text-amber-500"
                                      : stage === "bottleneck"
                                        ? "bg-red-500/10 text-red-500"
                                        : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {task.status}
                              </span>
                            </td>
                            <td className="p-4 text-right text-muted-foreground">
                              {bidHrs > 0 ? `${bidHrs}h` : "-"}
                            </td>
                            <td className="p-4 text-right text-foreground font-medium">
                              {actualHrs > 0 ? `${actualHrs}h` : "-"}
                            </td>
                            <td
                              className={`p-4 text-right font-medium ${isOverBudget ? "text-red-500" : variance > 0 && actualHrs > 0 ? "text-emerald-500" : "text-muted-foreground"}`}
                            >
                              {actualHrs === 0
                                ? "-"
                                : variance > 0
                                  ? `+${variance}h`
                                  : `${variance}h`}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
