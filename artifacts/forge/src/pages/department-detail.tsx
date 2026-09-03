import { useParams, Link } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TASKS,
  ROLE_LABELS,
  isTaskActive,
  isTaskDone,
  TaskStatus,
} from "@/data/mockData";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import {
  Users,
  ListTodo,
  TrendingUp,
  ArrowLeft,
  MoreHorizontal,
  ShieldCheck,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityChip } from "@/components/shared/PriorityChip";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { useTasksStore } from "@/store/tasks";
import { useCapability } from "@/hooks/use-capability";
import { useDepartmentScope } from "@/hooks/useDepartmentScope";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// store/auth.ts's login hydration mutates the shared `TASKS` mock array
// in-place with raw real TaskDTO[] data (field: `assignedTo`, no
// `assigneeId` at all — see hooks/useTasks.ts's TaskDTO). This tolerates
// both that real shape and the legacy mock `Task` shape (pre-login) so
// assignee lookups below don't silently stop resolving after hydration.
const getAssigneeId = (t: any): string | null | undefined =>
  t.assignedTo ?? t.assigneeId;

const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "bottleneck", label: "Bottleneck" },
  { value: "review", label: "Review" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
];

export default function DepartmentDetail() {
  const { id } = useParams<{ id: string }>();
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const dept = departments.find((d) => d.id === id);
  const { currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState("overview");
  const { setCreateTaskModalOpen } = useUIStore();
  const { reassignTask, updateTaskStatus } = useTasksStore();
  const { toast } = useToast();
  const canAssignTasks = useCapability("assign_tasks");
  const canEditTasks = useCapability("edit_tasks");
  const canManagePipeline = useCapability("manage_pipeline");
  const isGlobalManager = useDepartmentScope().scoped === false;

  if (!dept) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Department not found
      </div>
    );
  }

  if (!isGlobalManager && currentUser?.departmentId !== dept.id) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto text-center mt-20">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">
          You do not have permission to view other department's details.
        </p>
        <Link href="/departments" className="text-primary hover:underline">
          Return to your department
        </Link>
      </div>
    );
  }

  const team = users.filter((u) => u.departmentId === dept.id).sort((a, b) => {
    // Sort by role hierarchy
    const roleWeight = {
      producer: 3,
      lead: 2,
      artist: 1,
    } as Record<string, number>;
    return (roleWeight[b.role] || 0) - (roleWeight[a.role] || 0);
  });

  const supervisor = team.find((u) => u.id === dept.supervisorId);
  const lead = team.find((u) => u.id === dept.leadId);

  const deptTasks = TASKS.filter((t) => t.department === dept.name);
  // Use the shared isTaskDone/isTaskActive classification (same as the Departments overview
  // and Tracking Grid pages) so a department's active/done counts agree everywhere it's shown.
  const activeTasks = deptTasks.filter((t) => isTaskActive(t.status));
  const completedTasks = deptTasks.filter((t) => isTaskDone(t.status));

  // Real "Avg Review Cycle" computed from the same underlying task data as the
  // other stat tiles: for every task that has entered or passed review, the
  // span from creation to its last recorded status change (createdAt →
  // lastStatusUpdate), in days. Previously this tile was a hardcoded "1.2d"
  // that never reflected the department's actual data.
  const reviewCycleTasks = deptTasks.filter((t) =>
    ["review", "lead-review", "approved", "complete"].includes(t.status),
  );
  const avgReviewCycleDays =
    reviewCycleTasks.length > 0
      ? reviewCycleTasks.reduce((sum, t) => {
          const days =
            (new Date(t.lastStatusUpdate).getTime() -
              new Date(t.createdAt).getTime()) /
            86_400_000;
          return sum + Math.max(0, days);
        }, 0) / reviewCycleTasks.length
      : null;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link
          href="/departments"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Departments
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg"
              style={{ backgroundColor: dept.color }}
            >
              {dept.abbreviation}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{dept.name}</h1>
              <p className="text-muted-foreground mt-1">{dept.description}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {canAssignTasks && (
              <button
                onClick={() => setCreateTaskModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
              >
                Assign Tasks
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team ({team.length})</TabsTrigger>
          <TabsTrigger value="tasks">
            Active Tasks ({activeTasks.length})
          </TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          {canManagePipeline && (
            <TabsTrigger value="settings">Settings</TabsTrigger>
          )}
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 animate-in fade-in">
          {/* Top Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{team.length}</div>
                  <div className="text-xs text-muted-foreground">
                    Team Members
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <ListTodo className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{activeTasks.length}</div>
                  <div className="text-xs text-muted-foreground">
                    Active Tasks
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {deptTasks.length > 0
                      ? Math.round(
                          (completedTasks.length / deptTasks.length) * 100,
                        )
                      : 0}
                    %
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Completion Rate
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {avgReviewCycleDays !== null
                      ? `${avgReviewCycleDays.toFixed(1)}d`
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg Review Cycle
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Leadership */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                Leadership
              </h3>

              {supervisor && (
                <Card className="border-border/50">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Avatar
                      className="w-12 h-12 border-2"
                      style={{ borderColor: dept.color }}
                    >
                      <AvatarImage src={supervisor.avatar} />
                      <AvatarFallback>
                        {supervisor.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">{supervisor.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {supervisor.title}
                      </div>
                      <Badge
                        variant="secondary"
                        className="mt-2 text-[10px] bg-primary/10 text-primary hover:bg-primary/20"
                      >
                        Supervisor
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {lead && lead.id !== supervisor?.id && (
                <Card className="border-border/50">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Avatar
                      className="w-12 h-12 border-2"
                      style={{ borderColor: dept.color + "80" }}
                    >
                      <AvatarImage src={lead.avatar} />
                      <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {lead.title}
                      </div>
                      <Badge variant="secondary" className="mt-2 text-[10px]">
                        Lead
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Team Skills Overview */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                Department Skills Matrix
              </h3>
              <Card className="border-border/50">
                <CardContent className="p-6">
                  {/* Just a visualization mock of skills distribution */}
                  <div className="space-y-4">
                    {Array.from(new Set(team.flatMap((u) => u.skills ?? [])))
                      .slice(0, 5)
                      .map((skill) => {
                        const usersWithSkill = team.filter((u) =>
                          u.skills?.includes(skill),
                        ).length;
                        const percentage = Math.round(
                          (usersWithSkill / team.length) * 100,
                        );
                        return (
                          <div key={skill} className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium">{skill}</span>
                              <span className="text-muted-foreground">
                                {usersWithSkill}{" "}
                                {usersWithSkill === 1 ? "artist" : "artists"} (
                                {percentage}%)
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: dept.color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TEAM TAB */}
        <TabsContent value="team" className="space-y-4 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {team.map((member) => (
              <Card
                key={member.id}
                className="hover:border-primary/50 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <Badge
                      variant={
                        member.status === "active" ? "default" : "secondary"
                      }
                      className={
                        member.status === "active"
                          ? "bg-green-500/10 text-green-500 hover:bg-green-500/20 shadow-none"
                          : ""
                      }
                    >
                      {member.status}
                    </Badge>
                  </div>
                  <div className="font-semibold">{member.name}</div>
                  <div className="text-xs text-muted-foreground mb-3">
                    {ROLE_LABELS[member.role] || member.title}
                  </div>

                  <div className="flex flex-wrap gap-1 mb-4">
                    {(member.skills ?? []).slice(0, 2).map((s) => (
                      <span
                        key={s}
                        className="px-1.5 py-0.5 bg-muted rounded text-[9px] text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                    {(member.skills?.length ?? 0) > 2 && (
                      <span className="px-1.5 py-0.5 bg-muted rounded text-[9px] text-muted-foreground">
                        +{(member.skills?.length ?? 0) - 2}
                      </span>
                    )}
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                    <div className="text-muted-foreground">Capacity</div>
                    <div className="font-semibold flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${(member.capacity ?? 0) > 90 ? "bg-red-500" : (member.capacity ?? 0) > 75 ? "bg-yellow-500" : "bg-green-500"}`}
                          style={{ width: `${member.capacity ?? 0}%` }}
                        />
                      </div>
                      {member.capacity ?? 0}%
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TASKS TAB (Simplified view for dept page) */}
        <TabsContent value="tasks" className="space-y-4 animate-in fade-in">
          {activeTasks.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListTodo />
                </EmptyMedia>
                <EmptyTitle>No active tasks</EmptyTitle>
                <EmptyDescription>
                  {dept.name} has no active tasks right now.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {activeTasks.slice(0, 15).map((task) => {
                    const assignee = users.find(
                      (u) => u.id === getAssigneeId(task),
                    );
                    return (
                      <div
                        key={task.id}
                        className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <StatusBadge status={task.status} />
                          <div>
                            <div className="font-medium text-sm">
                              {task.title}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Due {new Date(task.dueDate).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <PriorityChip priority={task.priority} />
                          {assignee && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {assignee.name}
                              </span>
                              <Avatar className="w-6 h-6">
                                <AvatarImage src={assignee.avatar} />
                              </Avatar>
                            </div>
                          )}
                          {(canAssignTasks || canEditTasks) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1.5 hover:bg-muted rounded-md text-muted-foreground">
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {canAssignTasks && (
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      Reassign to…
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      {team
                                        .filter(
                                          (u) => u.id !== getAssigneeId(task),
                                        )
                                        .map((u) => (
                                          <DropdownMenuItem
                                            key={u.id}
                                            onSelect={() => {
                                              reassignTask(task.id, u.id);
                                              toast({
                                                title: "Task reassigned",
                                                description: `"${task.title}" reassigned to ${u.name}.`,
                                              });
                                            }}
                                          >
                                            {u.name}
                                          </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                )}
                                {canEditTasks && (
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      Change status
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      {TASK_STATUS_OPTIONS.filter(
                                        (o) => o.value !== task.status,
                                      ).map((o) => (
                                        <DropdownMenuItem
                                          key={o.value}
                                          onSelect={() => {
                                            updateTaskStatus(task.id, o.value);
                                            toast({
                                              title: "Status updated",
                                              description: `"${task.title}" moved to ${o.label}.`,
                                            });
                                          }}
                                        >
                                          {o.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* OTHER TABS */}
        <TabsContent
          value="performance"
          className="h-64 flex items-center justify-center border border-dashed border-border rounded-lg text-muted-foreground bg-muted/10"
        >
          Performance metrics visualization (Burndown, Velocity, Quality)
        </TabsContent>

        <TabsContent
          value="settings"
          className="h-64 flex items-center justify-center border border-dashed border-border rounded-lg text-muted-foreground bg-muted/10"
        >
          Department configuration, workflows, and automated pipeline rules
        </TabsContent>
      </Tabs>
    </div>
  );
}
