import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useShotStore } from "@/store/shots";
import { useAssetStore } from "@/store/assets";
import { useTasksStore } from "@/store/tasks";
import { PlayCircle, History, Film } from "lucide-react";
import { useRecentAuditLogs } from "@/hooks/useAuditLogs";
import { useUserStore } from "@/store/users";
import { useMemo } from "react";
import { getProjectId, useEntityProjectMap } from "@/lib/taskShape";
import { normalizeTaskStatus } from "@/lib/trackingStatus";
import { isTaskDone, type TaskStatus } from "@/data/mockData";
import { byDueDate } from "@/lib/taskDates";

// There is no burndown card here any more: a burndown needs a history of
// remaining work over time, and the only timestamps tasks carry
// (`createdAt`, `lastStatusUpdate`) are set by the tracksheet import, so any
// curve drawn from them would describe the import, not the show. The status
// breakdown below is the honest version of the same question.

const COLORS = {
  complete: "hsl(134 60% 30%)",
  review: "hsl(266 44% 52%)",
  "in-progress": "hsl(28 72% 41%)",
  bottleneck: "hsl(0 54% 41%)",
  todo: "hsl(204 20% 45%)",
  cancelled: "hsl(204 10% 32%)",
};

/** Pipeline stages collapsed to the buckets the breakdown chart shows. */
function statusBucket(status: TaskStatus): keyof typeof COLORS {
  if (isTaskDone(status)) return "complete";
  if (status === "cancelled") return "cancelled";
  if (status === "bottleneck") return "bottleneck";
  if (status === "in-progress") return "in-progress";
  if (status.endsWith("review")) return "review";
  return "todo";
}

const BUCKET_LABELS: Record<keyof typeof COLORS, string> = {
  complete: "Complete",
  review: "In Review",
  "in-progress": "In Progress",
  bottleneck: "Bottleneck",
  todo: "To Do",
  cancelled: "Cancelled",
};

export default function DashboardTab({ project }: { project: any }) {
  const shots = useShotStore((state) => state.shots);
  const assets = useAssetStore((state) => state.assets);
  const tasks = useTasksStore((state) => state.tasks);
  const entityProjectMap = useEntityProjectMap();
  const { data: events = [] } = useRecentAuditLogs(10);
  const users = useUserStore((state) => state.users);

  const allProjectShots = useMemo(
    () => shots.filter((s) => s.projectId === project.id),
    [shots, project.id],
  );
  const projectShots = allProjectShots.slice(0, 4);
  const projectAssets = useMemo(
    () => assets.filter((a) => a.projectId === project.id),
    [assets, project.id],
  );

  const projectTasks = useMemo(
    () => tasks.filter((t) => getProjectId(t, entityProjectMap) === project.id),
    [tasks, entityProjectMap, project.id],
  );

  // Real task counts per pipeline stage — the studio's tracksheet codes
  // resolved to stages first (see lib/trackingStatus.ts).
  const pieData = useMemo(() => {
    const counts = new Map<keyof typeof COLORS, number>();
    projectTasks.forEach((t) => {
      const bucket = statusBucket(normalizeTaskStatus(t.status));
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    });
    return (Object.keys(COLORS) as (keyof typeof COLORS)[])
      .map((bucket) => ({
        name: BUCKET_LABELS[bucket],
        value: counts.get(bucket) ?? 0,
        fill: COLORS[bucket],
      }))
      .filter((d) => d.value > 0);
  }, [projectTasks]);

  const doneTasks = projectTasks.filter((t) =>
    isTaskDone(normalizeTaskStatus(t.status)),
  ).length;
  const progressPercent =
    projectTasks.length > 0
      ? Math.round((doneTasks / projectTasks.length) * 100)
      : null;

  const isEntityApproved = (status: string) =>
    ["complete", "approved", "published"].includes(status);
  const approvedShots = allProjectShots.filter((s) =>
    isEntityApproved(s.status),
  ).length;
  const approvedAssets = projectAssets.filter((a) =>
    isEntityApproved(a.status),
  ).length;

  // Nearest deadlines among this project's unfinished tasks — real due dates,
  // overdue ones included and labelled as such rather than hidden.
  const upcomingDeadlines = useMemo(
    () =>
      projectTasks
        .filter(
          (t) => t.dueDate && !isTaskDone(normalizeTaskStatus(t.status)),
        )
        .sort(
          (a, b) =>
            byDueDate(a.dueDate, b.dueDate),
        )
        .slice(0, 5),
    [projectTasks],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-8">
      <div className="lg:col-span-3 min-w-0">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Latest Shots Previews
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {projectShots.map((shot) => (
            <div
              key={shot.id}
              className="group relative aspect-video bg-muted rounded-lg overflow-hidden border border-border cursor-pointer hover:border-primary/50 transition-colors"
            >
              {/* Every real shot's thumbnail column is empty — rendering the
                  img unconditionally showed a broken-image icon on each tile. */}
              {shot.thumbnail ? (
                <img
                  src={shot.thumbnail}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  alt={shot.name}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="w-8 h-8 text-muted-foreground/50" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <PlayCircle className="w-10 h-10 text-white drop-shadow-md" />
              </div>
              <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center text-xs text-white drop-shadow-md font-medium">
                <span>{shot.name}</span>
                <span className="bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-md">
                  {shot.status}
                </span>
              </div>
            </div>
          ))}
          {projectShots.length === 0 && (
            <div className="col-span-4 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground text-sm">
              No shots uploaded for this project yet.
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 space-y-6 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Task Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] min-w-0">
            {pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No tasks on this project yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                    }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Overall Progress",
              value:
                progressPercent === null ? "No tasks" : `${progressPercent}%`,
            },
            {
              label: "Tasks Complete",
              value:
                projectTasks.length === 0
                  ? "—"
                  : `${doneTasks} / ${projectTasks.length}`,
            },
            {
              label: "Shots Approved",
              value:
                allProjectShots.length === 0
                  ? "No shots"
                  : `${approvedShots} / ${allProjectShots.length}`,
            },
            {
              label: "Assets Approved",
              value:
                projectAssets.length === 0
                  ? "No assets"
                  : `${approvedAssets} / ${projectAssets.length}`,
            },
          ].map((k, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground font-medium mb-1">
                  {k.label}
                </div>
                <div className="text-xl font-bold">{k.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-6 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[300px] overflow-y-auto space-y-4">
            {events.map((event) => (
              <div key={event.id} className="flex gap-3 text-sm">
                <div className="mt-0.5">
                  <History className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="font-medium">
                    {event.targetEntityType} {event.action}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    by{" "}
                    {users.find((u) => u.id === event.actorUserId)?.name ??
                      "Unknown"}{" "}
                    on {new Date(event.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-muted-foreground text-sm text-center py-4">
                No recent activity.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingDeadlines.map((task) => {
              const due = new Date(task.dueDate);
              const isOverdue = due.getTime() < Date.now();
              return (
                <div
                  key={task.id}
                  className="flex justify-between items-center gap-3 text-sm border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-medium truncate">{task.title}</span>
                  <span
                    className={`shrink-0 ${isOverdue ? "text-red-500" : "text-muted-foreground"}`}
                  >
                    {due.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                    {isOverdue && " (overdue)"}
                  </span>
                </div>
              );
            })}
            {upcomingDeadlines.length === 0 && (
              <div className="text-muted-foreground text-sm text-center py-4">
                No task deadlines set on this project.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
