import { useRoute, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ASSETS, PROJECTS, USERS, TASKS, SHOTS, VERSIONS, AUDIT_EVENTS, AI_SUGGESTIONS } from '@/data/mockData';
import { ChevronLeft, Package, Film, ListTodo, GitBranch, Clock, Upload, Sparkles, ArrowRight, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function AssetDetail() {
  const [, params] = useRoute('/assets/:id');
  const asset = ASSETS.find(a => a.id === params?.id);

  if (!asset) return <div className="p-6 text-center text-muted-foreground">Asset not found.</div>;

  const project = PROJECTS.find(p => p.id === asset.projectId);
  const assignee = USERS.find(u => u.id === asset.assigneeId);
  const relatedTasks = TASKS.filter(t => t.assetId === asset.id).slice(0, 5);
  const relatedShots = SHOTS.filter(s => TASKS.some(t => t.shotId === s.id && t.assetId === asset.id)).slice(0, 5);
  const versions = VERSIONS.filter(v => v.entityId === asset.id).slice(0, 8);
  const events = AUDIT_EVENTS.filter(e => e.entityId === asset.id).slice(0, 10);
  const suggestions = AI_SUGGESTIONS.filter(s => s.entityType === 'asset').slice(0, 2);
  const deps = asset.dependencies.map(d => ASSETS.find(a => a.id === d)).filter(Boolean);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" asChild className="h-7 w-7"><Link href="/assets"><ChevronLeft className="w-4 h-4" /></Link></Button>
        <Link href="/assets" className="hover:text-foreground transition-colors">Assets</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{asset.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-6">
        <div className="w-48 h-32 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center shrink-0">
          <Package className="w-12 h-12 text-muted-foreground/30" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{asset.name}</h1>
            <Badge className="text-xs">{asset.type}</Badge>
            <Badge variant={asset.status === 'complete' ? 'default' : 'secondary'} className="text-xs">{asset.status}</Badge>
          </div>
          <p className="text-muted-foreground mb-3">{asset.description}</p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Avatar className="w-5 h-5"><AvatarImage src={assignee?.avatar} /><AvatarFallback>{assignee?.name.charAt(0)}</AvatarFallback></Avatar>
              {assignee?.name}
            </div>
            <span>Version: <span className="font-mono text-foreground">{asset.version}</span></span>
            <span>Size: {asset.fileSize}</span>
            {asset.polyCount && <span>Polys: {asset.polyCount}</span>}
            <span>Project: <Link href={`/projects/${project?.id}`} className="text-primary hover:underline">{project?.name}</Link></span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm"><Upload className="w-4 h-4 mr-1" /> Publish</Button>
          <Button size="sm">Open in DCC</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({relatedTasks.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Dependencies */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><GitBranch className="w-4 h-4" /> Dependencies</CardTitle></CardHeader>
                <CardContent>
                  {deps.length > 0 ? deps.map(d => d && (
                    <Link key={d.id} href={`/assets/${d.id}`}>
                      <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/30 transition-colors">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{d.name}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{d.status}</Badge>
                      </div>
                    </Link>
                  )) : <p className="text-sm text-muted-foreground">No dependencies.</p>}
                </CardContent>
              </Card>

              {/* Related Shots */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Film className="w-4 h-4" /> Used in Shots</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {relatedShots.length > 0 ? relatedShots.map(s => (
                    <Link key={s.id} href={`/shots/${s.id}`}>
                      <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/30 transition-colors">
                        <Film className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{s.name}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{s.status}</Badge>
                      </div>
                    </Link>
                  )) : <p className="text-sm text-muted-foreground">Not linked to any shots yet.</p>}
                </CardContent>
              </Card>

              {/* Tags & Metadata */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Tags & Metadata</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {asset.tags.map(tag => <Badge key={tag} variant="outline">{tag}</Badge>)}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Created:</span> {asset.updatedAt}</div>
                    <div><span className="text-muted-foreground">Publish Status:</span> <Badge variant="outline" className="text-xs">{asset.publishStatus}</Badge></div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: AI Suggestions */}
            <div className="space-y-6">
              <Card className="border-purple-500/20">
                <CardHeader className="pb-3 bg-purple-500/5 border-b border-border">
                  <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400" /> AI Suggestions</CardTitle>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-border">
                  {suggestions.map(s => (
                    <div key={s.id} className="p-4">
                      <Badge className={`text-[10px] mb-1.5 ${s.severity === 'HIGH' ? 'bg-orange-500 text-white' : 'bg-yellow-500 text-white'}`}>{s.severity}</Badge>
                      <p className="text-sm">{s.title}</p>
                      <Button size="sm" variant="ghost" className="h-6 text-xs mt-2 text-purple-400">{s.suggestedAction} <ArrowRight className="w-3 h-3 ml-1" /></Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Publish Status */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Publish Status</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-3">
                    {asset.publishStatus === 'published' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : asset.publishStatus === 'failed' ? <XCircle className="w-5 h-5 text-red-500" /> : <Clock className="w-5 h-5 text-yellow-500" />}
                    <span className="font-medium capitalize">{asset.publishStatus}</span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Target: production</div>
                    <div>Version: {asset.version}</div>
                    <div>Last updated: {asset.updatedAt}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          <div className="space-y-3">
            {versions.map(v => (
              <Card key={v.id} className="hover:bg-muted/20 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-20 h-12 rounded bg-muted flex items-center justify-center font-mono text-sm font-bold">{v.versionNumber}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{v.notes}</span>
                      <Badge className={`text-[10px] ${v.status === 'approved' ? 'bg-green-500/10 text-green-500' : v.status === 'rejected' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}>{v.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      by {USERS.find(u => u.id === v.createdById)?.name} · {new Date(v.createdAt).toLocaleDateString()} · {v.fileSize}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <div className="space-y-2">
            {relatedTasks.map(t => (
              <Card key={t.id} className="hover:bg-muted/20 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-4">
                  <ListTodo className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{USERS.find(u => u.id === t.assigneeId)?.name} · Due {t.dueDate}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                  <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="space-y-3">
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
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
