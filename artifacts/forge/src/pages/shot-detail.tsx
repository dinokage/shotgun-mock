import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useShots } from "@/hooks/useShots";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import {
  useSequenceTeam,
  useJoinSequenceTeam,
  useLeaveSequenceTeam,
} from "@/hooks/useSequences";
import { getAssigneeId, getAssetId, getShotId } from "@/lib/taskShape";
import { useProjectStore } from "@/store/projects";
import { useUserStore } from "@/store/users";
import { useTasksStore } from "@/store/tasks";
import { useAssetStore } from "@/store/assets";
import { useReviewStore } from "@/store/reviews";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Film, Package, ListTodo, Users, LogOut } from "lucide-react";

export default function ShotDetail() {
  const [, params] = useRoute("/shots/:id");
  const { data: liveShots = [], isLoading } = useShots();
  const liveVersions = useReviewStore((state) => state.versions);
  const setActiveTaskDrawer = useUIStore((state) => state.setActiveTaskDrawer);
  const projects = useProjectStore((s) => s.projects);
  const users = useUserStore((s) => s.users);
  const tasks = useTasksStore((s) => s.tasks);
  const assets = useAssetStore((s) => s.assets);

  const shot = liveShots.find((s) => s.id === params?.id);
  const { data: auditLogs = [] } = useAuditLogs(shot?.id);
  const { data: teamMembers = [] } = useSequenceTeam(shot?.sequenceId ?? undefined);
  const joinTeam = useJoinSequenceTeam();
  const leaveTeam = useLeaveSequenceTeam();
  const currentUser = useAuthStore((s) => s.currentUser);
  const { toast } = useToast();
  if (isLoading)
    return (
      <div className="p-6 text-center text-muted-foreground">
        Loading shot...
      </div>
    );
  if (!shot)
    return (
      <div className="p-6 text-center text-muted-foreground">
        Shot not found.
      </div>
    );

  const project = projects.find((p) => p.id === shot.projectId);
  const assignee = users.find((u) => u.id === shot.assigneeId);
  const isOnSequenceTeam = teamMembers.some(
    (m) => m.userId === currentUser?.id,
  );

  const handleJoinTeam = async () => {
    if (!shot.sequenceId) return;
    try {
      await joinTeam.mutateAsync(shot.sequenceId);
      toast({ title: "Joined the sequence team" });
    } catch {
      toast({
        title: "Couldn't join",
        description: "Something went wrong — try again.",
        variant: "destructive",
      });
    }
  };

  const handleLeaveTeam = async () => {
    if (!shot.sequenceId) return;
    try {
      await leaveTeam.mutateAsync(shot.sequenceId);
      toast({ title: "Left the sequence team" });
    } catch {
      toast({
        title: "Couldn't leave",
        description: "Something went wrong — try again.",
        variant: "destructive",
      });
    }
  };
  const relatedTasks = tasks.filter((t) => getShotId(t) === shot.id).slice(
    0,
    5,
  );
  const versions = liveVersions
    .filter((v) => v.entityId === shot.id)
    .sort((a, b) => b.versionNumber.localeCompare(a.versionNumber));
  const events = auditLogs.slice(0, 10);
  const usedAssets = assets.filter((a) =>
    tasks.some((t) => getShotId(t) === shot.id && getAssetId(t) === a.id),
  ).slice(0, 5);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" asChild className="h-7 w-7">
          <Link href="/shots">
            <ChevronLeft className="w-4 h-4" />
          </Link>
        </Button>
        <Link href="/shots" className="hover:text-foreground">
          Shots
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{shot.name}</span>
      </div>

      <div className="flex items-start gap-6">
        <div className="w-64 h-40 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center shrink-0 relative">
          <Film className="w-12 h-12 text-muted-foreground/30" />
          <div className="absolute bottom-2 right-2 font-mono text-xs bg-black/50 text-white px-2 py-0.5 rounded">
            {shot.frameRange}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{shot.name}</h1>
            <Badge>{shot.status}</Badge>
            <Badge variant="outline">{shot.complexity} complexity</Badge>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-1.5">
              <Avatar className="w-5 h-5">
                <AvatarImage src={assignee?.avatar} />
                <AvatarFallback>{assignee?.name.charAt(0)}</AvatarFallback>
              </Avatar>
              {assignee?.name}
            </div>
            <span>
              Version:{" "}
              <span className="font-mono text-foreground">
                {shot.currentVersion}
              </span>
            </span>
            <span>{shot.duration} frames</span>
            <span>
              Project:{" "}
              {project ? (
                <Link
                  href={`/projects/${project.id}`}
                  className="text-primary hover:underline"
                >
                  {project.name}
                </Link>
              ) : (
                <span>{shot.projectId ?? "Unknown"}</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={
                shot.internalReviewStatus === "approved"
                  ? "default"
                  : "secondary"
              }
              className="text-xs"
            >
              Review: {shot.internalReviewStatus}
            </Badge>
          </div>
          {shot.notes && (
            <p className="text-sm text-muted-foreground mt-3 italic">
              {shot.notes}
            </p>
          )}
        </div>
        <Button size="sm" asChild>
          <Link href={`/review?shot=${shot.id}`}>Open in Review</Link>
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">
            Versions ({versions.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({relatedTasks.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4" /> Used Assets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {usedAssets.length > 0 ? (
                  usedAssets.map((a) => (
                    <Link key={a.id} href={`/assets/${a.id}`}>
                      <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/30 transition-colors">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{a.name}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] ml-auto"
                        >
                          {a.type}
                        </Badge>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No assets linked.
                  </p>
                )}
              </CardContent>
            </Card>

            {shot.sequenceId && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4" /> Sequence Team
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Artists currently working this sequence together.
                    </p>
                    {currentUser?.role === "artist" &&
                      (isOnSequenceTeam ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          disabled={leaveTeam.isPending}
                          onClick={handleLeaveTeam}
                        >
                          <LogOut className="w-3 h-3" /> Leave Team
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          disabled={joinTeam.isPending}
                          onClick={handleJoinTeam}
                        >
                          <Users className="w-3 h-3" /> Join Team
                        </Button>
                      ))}
                  </div>
                  {teamMembers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {teamMembers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-1.5 bg-muted/40 rounded-full pl-1 pr-2.5 py-1"
                        >
                          <Avatar className="w-5 h-5">
                            <AvatarImage src={m.avatar ?? undefined} />
                            <AvatarFallback>
                              {m.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium">
                            {m.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No one has joined this sequence's team yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          <div className="flex gap-4 overflow-x-auto pb-6 pt-2 px-1 snap-x">
            {versions.map((v, i) => (
              <Card
                key={v.id}
                className="min-w-[300px] shrink-0 snap-center hover:border-primary/50 transition-colors"
              >
                <div className="h-32 bg-muted rounded-t-lg flex items-center justify-center relative overflow-hidden group">
                  <Film className="w-8 h-8 text-muted-foreground/30" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button size="sm" asChild className="h-7 text-xs">
                      <Link href={`/review?shot=${shot.id}&version=${v.id}`}>
                        View
                      </Link>
                    </Button>
                    {i < versions.length - 1 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        asChild
                        className="h-7 text-xs"
                      >
                        <Link
                          href={`/review?shot=${shot.id}&version=${v.id}&compare=${versions[i + 1].id}`}
                        >
                          Compare
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-lg">
                      {v.versionNumber}
                    </span>
                    <Badge
                      className={`text-[10px] ${v.status === "approved" ? "bg-green-500/10 text-green-500" : v.status === "rejected" ? "bg-red-500/10 text-red-500" : "bg-yellow-500/10 text-yellow-500"}`}
                    >
                      {v.status}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium mb-2">{v.notes}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="w-4 h-4">
                        <AvatarImage
                          src={
                            users.find((u) => u.id === v.createdById)?.avatar
                          }
                        />
                        <AvatarFallback>
                          {users.find(
                            (u) => u.id === v.createdById,
                          )?.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {
                        users.find((u) => u.id === v.createdById)?.name.split(
                          " ",
                        )[0]
                      }
                    </div>
                    <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {versions.length === 0 && (
              <p className="text-sm text-muted-foreground w-full text-center py-12">
                No versions published yet.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-2">
          {relatedTasks.map((t) => (
            <Card
              key={t.id}
              className="hover:bg-muted/20 transition-colors cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => setActiveTaskDrawer(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveTaskDrawer(t.id);
                }
              }}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <ListTodo className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {users.find((u) => u.id === getAssigneeId(t))?.name} · Due{" "}
                    {t.dueDate}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {t.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {relatedTasks.length === 0 && (
            <Empty className="border-2 border-dashed border-border rounded-lg py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListTodo />
                </EmptyMedia>
                <EmptyTitle>No tasks yet</EmptyTitle>
                <EmptyDescription>
                  No tasks are linked to this shot.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-3">
          {events.map((ev) => {
            const user = users.find((u) => u.id === ev.actorUserId);
            const changedFields = Object.keys(ev.metadata?.before ?? {});
            const description =
              changedFields.length > 0
                ? `Updated ${changedFields.join(", ")}`
                : `${ev.action} ${ev.targetEntityType}`;
            return (
              <div
                key={ev.id}
                className="flex items-start gap-3 p-3 rounded border border-border"
              >
                <Avatar className="w-7 h-7">
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback>{user?.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm">
                    <span className="font-medium">{user?.name}</span>{" "}
                    <span className="text-muted-foreground">
                      {description}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {ev.createdAt}
                  </div>
                </div>
              </div>
            );
          })}
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No activity recorded.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
