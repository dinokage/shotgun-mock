import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  USERS,
  TASKS,
  PROJECTS,
  DEPARTMENTS,
  ROLE_LABELS,
  isTaskActive,
} from "@/data/mockData";
import {
  ListTodo,
  FolderOpen,
  Clock,
  Mail,
  MapPin,
  Building2,
  ArrowLeft,
  ArrowUpRight,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityChip } from "@/components/shared/PriorityChip";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useCapability } from "@/hooks/use-capability";
import {
  STUDIO_LEADERSHIP_ROLES,
  LEADERSHIP_ROLES,
  DEPARTMENT_LEADERSHIP_ROLES,
} from "@/store/permissions";

export default function Profile() {
  const { id } = useParams<{ id?: string }>();
  const { currentUser } = useAuthStore();
  const {
    setActiveTaskDrawer,
    setCreateTaskModalOpen,
    setCreateTaskDefaultAssigneeId,
  } = useUIStore();
  const canAssignTasks = useCapability("assign_tasks");

  const userId = id || currentUser?.id;
  const user = USERS.find((u) => u.id === userId);

  if (!user) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        User not found
      </div>
    );
  }

  const isMe = currentUser?.id === user.id;

  // Mirror the roster visibility rule from people.tsx: a profile shouldn't
  // be reachable by direct URL if the viewer wouldn't see this person in
  // their Studio Roster in the first place.
  const canView =
    !!currentUser &&
    (isMe ||
      (() => {
        const isArtist = currentUser.role === "artist";
        const isDeptLeadership = DEPARTMENT_LEADERSHIP_ROLES.includes(
          currentUser.role,
        );

        if (isArtist) {
          return user.departmentId === currentUser.departmentId;
        }
        if (isDeptLeadership) {
          const targetIsLeadership = LEADERSHIP_ROLES.includes(user.role);
          return (
            user.departmentId === currentUser.departmentId || targetIsLeadership
          );
        }
        if (currentUser.role === "client") {
          // Clients only see their studio points of contact, not the internal roster.
          return STUDIO_LEADERSHIP_ROLES.includes(user.role);
        }
        // Studio leadership (admin/production_head) sees everyone.
        return true;
      })());

  if (!canView) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>You don't have access to view this profile.</p>
        <Link
          href="/people"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </Link>
      </div>
    );
  }

  const dept = DEPARTMENTS.find((d) => d.id === user.departmentId);
  const supervisor = user.supervisorId
    ? USERS.find((u) => u.id === user.supervisorId)
    : null;

  const myTasks = TASKS.filter((t) => t.assigneeId === user.id);
  const myProjects = [...new Set(myTasks.map((t) => t.projectId))]
    .map((pid) => PROJECTS.find((p) => p.id === pid))
    .filter(Boolean);
  // Shared isTaskActive classification (see data/mockData.ts) so this stat and the
  // "Active Tasks" list below always agree with each other and with every other
  // page's active/done rollups for the same underlying task data.
  const activeTasks = myTasks.filter((t) => isTaskActive(t.status));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back link if navigating from directory */}
      {id && (
        <Link
          href="/people"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </Link>
      )}

      {/* Profile Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        <Avatar
          className="w-24 h-24 border-4 shadow-sm"
          style={{ borderColor: dept?.color || "var(--border)" }}
        >
          <AvatarImage src={user.avatar} alt={user.name} />
          <AvatarFallback className="text-3xl">
            {user.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{user.name}</h1>
            <Badge
              variant={user.status === "active" ? "default" : "secondary"}
              className={
                user.status === "active"
                  ? "bg-green-500/10 text-green-500 hover:bg-green-500/20 shadow-none"
                  : ""
              }
            >
              {user.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-lg">
            {ROLE_LABELS[user.role] || user.title}
          </p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Mail className="w-4 h-4" /> {user.email}
            </span>
            {dept && (
              <Link
                href={`/departments/${dept.id}`}
                className="flex items-center gap-1.5 hover:text-primary transition-colors"
              >
                <Building2 className="w-4 h-4" /> {dept.name}
              </Link>
            )}
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />{" "}
              {user.studioId === "studio1"
                ? "Portland"
                : user.studioId === "studio2"
                  ? "London"
                  : "Tokyo"}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {currentUser && !isMe && (
            <Link href={`/chat?user=${user.id}`}>
              <Button
                variant="outline"
                className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
              >
                <Mail className="w-4 h-4 mr-2" /> Message
              </Button>
            </Link>
          )}
          {currentUser && !isMe && canAssignTasks && user.role !== "client" && (
            <Button
              onClick={() => {
                setCreateTaskDefaultAssigneeId(user.id);
                setCreateTaskModalOpen(true);
              }}
            >
              Assign Task
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-6">
          {/* Reports To */}
          {supervisor && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
                  Reports To
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Link href={`/people/${supervisor.id}`}>
                  <div className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={supervisor.avatar} />
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm group-hover:text-primary transition-colors flex items-center gap-1">
                        {supervisor.name}
                        <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {ROLE_LABELS[supervisor.role] || supervisor.title}
                      </div>
                    </div>
                  </div>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
                Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm">
                  <ListTodo className="w-4 h-4 text-blue-500" /> Active Tasks
                </div>
                <div className="font-semibold">{activeTasks.length}</div>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="w-4 h-4 text-purple-500" /> Projects
                </div>
                <div className="font-semibold">{myProjects.length}</div>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-yellow-500" /> Capacity
                </div>
                <div className="font-semibold">{user.capacity ?? 0}%</div>
              </div>
            </CardContent>
          </Card>

          {/* Skills */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
                Skills & Software
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(user.skills ?? []).map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="font-normal"
                  >
                    {skill}
                  </Badge>
                ))}
                {(user.licenses ?? [])
                  .filter(
                    (license) =>
                      !(user.skills ?? []).some(
                        (skill) =>
                          skill.toLowerCase() === license.toLowerCase(),
                      ),
                  )
                  .map((license) => (
                    <Badge
                      key={license}
                      variant="outline"
                      className="font-normal bg-muted/30"
                    >
                      {license}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Tabs defaultValue="tasks" className="w-full">
            <TabsList>
              <TabsTrigger value="tasks">Active Tasks</TabsTrigger>
              <TabsTrigger value="availability">Availability</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="mt-4">
              <Card className="border-border/50">
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {activeTasks.slice(0, 10).map((task) => (
                      <div
                        key={task.id}
                        className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setActiveTaskDrawer(task.id)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <StatusBadge status={task.status} />
                            <span className="font-semibold text-sm hover:text-primary transition-colors">
                              {task.title}
                            </span>
                          </div>
                          <PriorityChip priority={task.priority} />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground ml-[92px]">
                          <span>
                            Due {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                          <span>•</span>
                          <span style={{ color: dept?.color }}>
                            {dept?.abbreviation} Phase
                          </span>
                        </div>
                      </div>
                    ))}
                    {activeTasks.length === 0 && (
                      <div className="p-8 text-center text-muted-foreground">
                        No active tasks.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="availability" className="mt-4">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm">30-Day Forecast</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1 overflow-hidden rounded-md border border-border">
                    {Array.from({ length: 30 }).map((_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() + i);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const load = isWeekend
                        ? 0
                        : (user.capacity ?? 0) + Math.sin(i) * 30;
                      let color = "bg-green-500";
                      if (load > 110) color = "bg-red-500";
                      else if (load > 85) color = "bg-yellow-500";
                      if (isWeekend) color = "bg-muted";

                      return (
                        <div
                          key={i}
                          className={`h-16 flex-1 ${color} opacity-80 hover:opacity-100 transition-opacity`}
                          title={`${d.toLocaleDateString()}: ${isWeekend ? "Weekend" : Math.round(load) + "% capacity"}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground justify-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-green-500 opacity-80" />{" "}
                      Available
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-yellow-500 opacity-80" />{" "}
                      Near Capacity
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-red-500 opacity-80" />{" "}
                      Overloaded
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
