import { useRoute, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SHOTS, PROJECTS, USERS, TASKS, ASSETS, VERSIONS, AUDIT_EVENTS } from '@/data/mockData';
import { ChevronLeft, Film, Package, ListTodo, GitBranch, Clock, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';

export default function ShotDetail() {
  const [, params] = useRoute('/shots/:id');
  const shot = SHOTS.find(s => s.id === params?.id);
  if (!shot) return <div className="p-6 text-center text-muted-foreground">Shot not found.</div>;

  const project = PROJECTS.find(p => p.id === shot.projectId);
  const assignee = USERS.find(u => u.id === shot.assigneeId);
  const relatedTasks = TASKS.filter(t => t.shotId === shot.id).slice(0, 5);
  const versions = VERSIONS.filter(v => v.entityId === shot.id).slice(0, 8);
  const events = AUDIT_EVENTS.filter(e => e.entityId === shot.id).slice(0, 10);
  const usedAssets = ASSETS.filter(a => TASKS.some(t => t.shotId === shot.id && t.assetId === a.id)).slice(0, 5);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" asChild className="h-7 w-7"><Link href="/shots"><ChevronLeft className="w-4 h-4" /></Link></Button>
        <Link href="/shots" className="hover:text-foreground">Shots</Link><span>/</span>
        <span className="text-foreground font-medium">{shot.name}</span>
      </div>

      <div className="flex items-start gap-6">
        <div className="w-64 h-40 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center shrink-0 relative">
          <Film className="w-12 h-12 text-muted-foreground/30" />
          <div className="absolute bottom-2 right-2 font-mono text-xs bg-black/50 text-white px-2 py-0.5 rounded">{shot.frameRange}</div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{shot.name}</h1>
            <Badge>{shot.status}</Badge>
            <Badge variant="outline">{shot.complexity} complexity</Badge>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-1.5">
              <Avatar className="w-5 h-5"><AvatarImage src={assignee?.avatar} /><AvatarFallback>{assignee?.name.charAt(0)}</AvatarFallback></Avatar>
              {assignee?.name}
            </div>
            <span>Version: <span className="font-mono text-foreground">{shot.currentVersion}</span></span>
            <span>{shot.duration} frames</span>
            <span>Project: <Link href={`/projects/${project?.id}`} className="text-primary hover:underline">{project?.name}</Link></span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={shot.reviewStatus === 'approved' ? 'default' : 'secondary'} className="text-xs">
              Review: {shot.reviewStatus}
            </Badge>
          </div>
          {shot.notes && <p className="text-sm text-muted-foreground mt-3 italic">{shot.notes}</p>}
        </div>
        <Button size="sm" asChild><Link href="/review">Open in Review</Link></Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({relatedTasks.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Used Assets</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {usedAssets.length > 0 ? usedAssets.map(a => (
                  <Link key={a.id} href={`/assets/${a.id}`}>
                    <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/30 transition-colors">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{a.name}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{a.type}</Badge>
                    </div>
                  </Link>
                )) : <p className="text-sm text-muted-foreground">No assets linked.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><GitBranch className="w-4 h-4" /> Dependencies</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Shot dependencies mapped through the Knowledge Graph.</p>
                <Button variant="outline" size="sm" className="mt-3" asChild><Link href="/impact">View in Graph</Link></Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="versions" className="mt-4 space-y-3">
          {versions.map(v => (
            <Card key={v.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-20 h-12 rounded bg-muted flex items-center justify-center font-mono text-sm font-bold">{v.versionNumber}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{v.notes}</span>
                    <Badge className={`text-[10px] ${v.status === 'approved' ? 'bg-green-500/10 text-green-500' : v.status === 'rejected' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}>{v.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">by {USERS.find(u => u.id === v.createdById)?.name} · {new Date(v.createdAt).toLocaleDateString()}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-2">
          {relatedTasks.map(t => (
            <Card key={t.id} className="hover:bg-muted/20 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <ListTodo className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{USERS.find(u => u.id === t.assigneeId)?.name} · Due {t.dueDate}</div>
                </div>
                <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-3">
          {events.map(ev => {
            const user = USERS.find(u => u.id === ev.userId);
            return (
              <div key={ev.id} className="flex items-start gap-3 p-3 rounded border border-border">
                <Avatar className="w-7 h-7"><AvatarImage src={user?.avatar} /><AvatarFallback>{user?.name.charAt(0)}</AvatarFallback></Avatar>
                <div>
                  <div className="text-sm"><span className="font-medium">{user?.name}</span> <span className="text-muted-foreground">{ev.description}</span></div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{ev.timestamp}</div>
                </div>
              </div>
            );
          })}
          {events.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
