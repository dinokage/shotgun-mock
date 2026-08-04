import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useWorkspaceStore } from '@/store/workspace';
import { useUIStore } from '@/store/ui';
import { USERS, PROJECTS, TASKS, SHOTS, ASSETS, REVIEWS, PUBLISH_LOGS, AI_SUGGESTIONS, NOTIFICATIONS, AUDIT_EVENTS, DEPARTMENTS, WORKFLOW_RUNS } from '@/data/mockData';
import {
  FolderOpen, Users, ListTodo, PlayCircle, Upload, TrendingUp, AlertTriangle,
  BarChart3, HardDrive, Workflow, ArrowRight, CheckCircle2, Clock, Plus,
  Sparkles, Activity, Eye, Shield, User, Film, Package, Calendar, Key, Component
} from 'lucide-react';
import { Link } from 'wouter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PriorityChip } from '@/components/shared/PriorityChip';

// --- Manager Dashboard ---
function ManagerDashboard() {
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const { toast } = useToast();

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    setNewProjectOpen(false);
    toast({ title: 'Project Created', description: 'New project initialized and added to pipeline.' });
  };

  const pendingReviews = REVIEWS.filter(r => r.status === 'pending').length;
  const publishQueue = PUBLISH_LOGS.filter(p => p.status === 'queued' || p.status === 'validating').length;
  const activeTasks = TASKS.filter(t => t.status === 'in-progress' || t.status === 'review').length;
  const blockedTasks = TASKS.filter(t => t.status === 'blocked').length;
  const criticalSuggestions = AI_SUGGESTIONS.filter(s => s.severity === 'CRITICAL');
  const activeWorkflows = WORKFLOW_RUNS.filter(w => w.status === 'running').length;

  const licenseCounts = USERS.reduce((acc, user) => {
    user.licenses?.forEach(lic => acc[lic] = (acc[lic] || 0) + 1);
    return acc;
  }, {} as Record<string, number>);
  const topLicenses = Object.entries(licenseCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const stats = [
    { label: 'Active Projects', value: PROJECTS.filter(p => p.status !== 'COMPLETE').length, icon: FolderOpen, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Total Artists', value: USERS.length, icon: Users, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Active Tasks', value: activeTasks, icon: ListTodo, color: 'text-orange-500', bg: 'bg-orange-500/10', sub: `${blockedTasks} blocked` },
    { label: 'Reviews Pending', value: pendingReviews, icon: PlayCircle, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Publishing Queue', value: publishQueue, icon: Upload, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { label: 'Pipeline Health', value: '94%', icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/10', sub: 'All systems nominal' },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Production Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of all studio operations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2"><BarChart3 className="w-4 h-4" /> Export Report</Button>
          <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New Project</Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateProject}>
                <DialogHeader>
                  <DialogTitle>Create New Project</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Project Name</Label>
                    <Input required placeholder="e.g. Odyssey 2049" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Project Type</Label>
                      <Select required defaultValue="Feature Film">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Feature Film">Feature Film</SelectItem>
                          <SelectItem value="Animated Series">Animated Series</SelectItem>
                          <SelectItem value="Commercial">Commercial</SelectItem>
                          <SelectItem value="Game Cinematic">Game Cinematic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <div className="relative">
                        <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input required type="date" className="pl-9" />
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Create Project</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Integration Marquee */}
      <div className="overflow-hidden py-6 border-y border-border bg-card/30 relative flex">
        <div className="flex w-max animate-marquee">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center shrink-0">
              {['Autodesk Maya', 'The Foundry Nuke', 'SideFX Houdini', 'Arnold Render', 'Substance Painter', 'ZBrush', 'Unreal Engine', 'ShotGrid', 'Ftrack'].map((tool, j) => (
                <div key={j} className="flex items-center gap-3 text-foreground/80 hover:text-primary transition-colors font-semibold text-lg px-8">
                  <Component className="w-6 h-6 text-muted-foreground" />
                  <span className="whitespace-nowrap">{tool}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow cursor-pointer group">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <stat.icon className={`w-4.5 h-4.5 ${stat.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
              {stat.sub && <div className="text-[10px] text-muted-foreground/60 mt-1">{stat.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Projects + Tasks */}
        <div className="xl:col-span-2 space-y-6">
          {/* Project Cards */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Projects</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/projects">View All <ArrowRight className="w-4 h-4 ml-1" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {PROJECTS.slice(0, 5).map(project => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer group">
                    <div className="w-10 h-10 rounded-lg shrink-0" style={{ background: project.thumbnail }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm group-hover:text-primary transition-colors truncate">{project.name}</span>
                        <StatusBadge status={project.status} />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{project.shotsCount} shots</span>
                        <span>{project.assetsCount} assets</span>
                        <span>Due {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                    <div className="w-24 shrink-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{project.progress}%</span>
                      </div>
                      <Progress value={project.progress} className="h-1.5" />
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Department Utilization */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Department Utilization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {DEPARTMENTS.slice(0, 6).map((dept, i) => {
                const util = [87, 95, 72, 110, 68, 91][i];
                return (
                  <div key={dept.id} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dept.color }} />
                    <span className="text-sm w-32 truncate">{dept.name}</span>
                    <div className="flex-1">
                      <div className="h-6 bg-muted rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${util > 100 ? 'bg-red-500' : util > 85 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(util, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-sm font-medium w-12 text-right ${util > 100 ? 'text-red-500' : util > 85 ? 'text-yellow-500' : 'text-green-500'}`}>
                      {util}%
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {AUDIT_EVENTS.slice(0, 8).map(event => {
                  const user = USERS.find(u => u.id === event.userId);
                  return (
                    <div key={event.id} className="flex items-start gap-3 p-2 rounded hover:bg-muted/30 transition-colors">
                      <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                        <AvatarImage src={user?.avatar} />
                        <AvatarFallback>{user?.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <span className="font-medium">{user?.name}</span>{' '}
                          <span className="text-muted-foreground">{event.description}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{event.timestamp.split(' ')[1]}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: AI + Delivery + Storage */}
        <div className="space-y-6">
          {/* License Utilization */}
          <Card>
            <CardHeader className="pb-3 border-b border-border bg-card">
              <CardTitle className="text-lg flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-500" /> License Utilization
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {topLicenses.map(([name, count]) => (
                <div key={name} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">{count} seats</span>
                  </div>
                  <Progress value={(count / USERS.length) * 100} className="h-1.5 [&>div]:bg-emerald-500" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* AI Insights */}
          <Card className="border-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.05)]">
            <CardHeader className="pb-3 border-b border-border bg-primary/5">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> AI Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {criticalSuggestions.concat(AI_SUGGESTIONS.filter(s => s.severity === 'HIGH').slice(0, 2)).slice(0, 4).map(s => (
                  <div key={s.id} className="p-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className={`text-[10px] h-4 ${s.severity === 'CRITICAL' ? 'bg-red-500 text-white' : s.severity === 'HIGH' ? 'bg-orange-500 text-white' : 'bg-yellow-500 text-white'}`}>
                        {s.severity}
                      </Badge>
                    </div>
                    <p className="text-sm leading-relaxed mb-2">{s.title}</p>
                    <Button size="sm" variant="secondary" className="h-6 text-xs">
                      {s.suggestedAction} <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Delivery Prediction */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5" /> Delivery Prediction
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {PROJECTS.slice(0, 3).map(proj => {
                const risk = proj.riskScore;
                return (
                  <div key={proj.id} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{proj.name}</span>
                      <Badge variant={risk > 50 ? 'destructive' : risk > 30 ? 'secondary' : 'outline'} className="text-[10px]">
                        Risk: {risk}%
                      </Badge>
                    </div>
                    <Progress value={proj.progress} className="h-1.5" />
                    <div className="text-[10px] text-muted-foreground">
                      Due {new Date(proj.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Workflow Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Workflow className="w-5 h-5" /> Workflow Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Running</span><span className="font-bold text-blue-500">{activeWorkflows}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Completed (24h)</span><span className="font-bold text-green-500">{WORKFLOW_RUNS.filter(w => w.status === 'completed').length}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Failed (24h)</span><span className="font-bold text-red-500">{WORKFLOW_RUNS.filter(w => w.status === 'failed').length}</span></div>
            </CardContent>
          </Card>

          {/* Storage Usage */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <HardDrive className="w-5 h-5" /> Storage Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-32 h-32 mx-auto mb-4">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="64" cy="64" r="56" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                  <circle cx="64" cy="64" r="56" fill="none" stroke="hsl(var(--primary))" strokeWidth="8"
                    strokeDasharray={`${0.85 * 2 * Math.PI * 56} ${2 * Math.PI * 56}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold">85%</div>
                    <div className="text-[10px] text-muted-foreground">4.2 / 5 TB</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Renders</span><span>2.1 TB</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Assets</span><span>1.4 TB</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cache</span><span>0.7 TB</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- Animator Dashboard ---
function AnimatorDashboard() {
  const myTasks = TASKS.filter(t => t.assigneeId === 'u1').slice(0, 10);
  const { setActiveTaskDrawer } = useUIStore();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Work</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {USERS[0].name}</p>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4" /> New Task</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'My Tasks', value: myTasks.length, sub: `${myTasks.filter(t => t.priority === 'critical' || t.priority === 'high').length} high priority`, color: 'text-blue-500', bg: 'bg-blue-500/10', icon: ListTodo },
          { label: 'In Review', value: myTasks.filter(t => t.status === 'review').length, sub: 'Awaiting feedback', color: 'text-purple-500', bg: 'bg-purple-500/10', icon: Eye },
          { label: 'Blocked', value: myTasks.filter(t => t.status === 'blocked').length, sub: 'Need attention', color: 'text-red-500', bg: 'bg-red-500/10', icon: AlertTriangle },
          { label: 'Velocity', value: '85%', sub: 'vs last week', color: 'text-green-500', bg: 'bg-green-500/10', icon: TrendingUp },
        ].map((stat, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
              <div className="text-[10px] text-muted-foreground/60 mt-1">{stat.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">My Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="h-10 px-4 text-left font-medium">Task</th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-left font-medium">Priority</th>
                  <th className="h-10 px-4 text-left font-medium">Due Date</th>
                  <th className="h-10 px-4 text-left font-medium">Project</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.map(task => {
                  const project = PROJECTS.find(p => p.id === task.projectId);
                  return (
                    <tr key={task.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setActiveTaskDrawer(task.id)}>
                      <td className="p-4 font-medium">{task.title}</td>
                      <td className="p-4"><StatusBadge status={task.status} /></td>
                      <td className="p-4"><PriorityChip priority={task.priority} /></td>
                      <td className="p-4 text-muted-foreground">{task.dueDate}</td>
                      <td className="p-4 text-muted-foreground">{project?.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Reviewer Dashboard ---
function ReviewerDashboard() {
  const pendingReviews = REVIEWS.filter(r => r.status === 'pending').slice(0, 8);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground mt-1">{pendingReviews.length} items awaiting your review</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Pending Reviews', value: pendingReviews.length, color: 'text-purple-500', bg: 'bg-purple-500/10', icon: PlayCircle },
          { label: 'Reviewed Today', value: 5, color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle2 },
          { label: 'Avg Review Time', value: '45m', color: 'text-blue-500', bg: 'bg-blue-500/10', icon: Clock },
        ].map((stat, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pending Reviews</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingReviews.map(review => {
            const entity = review.entityType === 'shot' ? SHOTS.find(s => s.id === review.entityId) : ASSETS.find(a => a.id === review.entityId);
            return (
              <div key={review.id} className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div className="w-16 h-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  {review.entityType === 'shot' ? <Film className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{entity?.name || review.entityId}</div>
                  <div className="text-xs text-muted-foreground">{review.entityType} · {review.versionId}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Review</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Main Component ---
export default function Home() {
  const { currentRole } = useWorkspaceStore();

  switch (currentRole) {
    case 'manager':
      return <ManagerDashboard />;
    case 'animator':
      return <AnimatorDashboard />;
    case 'reviewer':
      return <ReviewerDashboard />;
    default:
      return <ManagerDashboard />;
  }
}
