import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { USERS, PROJECTS, TASKS, SHOTS, ASSETS, REVIEWS, PUBLISH_LOGS, DEPARTMENTS } from '@/data/mockData';
import { useToast } from '@/hooks/use-toast';
import {
  FolderOpen, Users, ListTodo, PlayCircle, Upload, TrendingUp, AlertTriangle,
  BarChart3, Workflow, ArrowRight, CheckCircle2, Clock, Plus,
  Sparkles, Activity, Shield, Film, Package, Building2
} from 'lucide-react';
import { Link } from 'wouter';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PriorityChip } from '@/components/shared/PriorityChip';

// --- Producer Dashboard (Studio-Wide Overview) ---
function ProducerDashboard() {
  const activeProjects = PROJECTS.filter(p => p.status !== 'COMPLETE');
  const activeTasks = TASKS.filter(t => t.status === 'in-progress' || t.status === 'lead-review' || t.status === 'manager-review').length;
  
  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Studio Overview</h1>
          <p className="text-muted-foreground mt-1">Global production health and metrics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="hidden sm:flex"><Activity className="w-4 h-4 mr-2" /> Pipeline Status</Button>
          <Button className="bg-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" /> New Project</Button>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Projects', value: activeProjects.length, icon: FolderOpen, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Active Shots / Sequences', value: '420 / 45', icon: ListTodo, color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Pending Client Reviews', value: 12, icon: Activity, color: 'text-pink-500', bg: 'bg-pink-500/10' },
          { label: 'Total Artists', value: USERS.length, icon: Users, color: 'text-green-500', bg: 'bg-green-500/10' },
        ].map((s, i) => (
          <Card key={i} className="border-border/50 bg-card hover:bg-muted/20 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`w-6 h-6 ${s.color}`} />
              </div>
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Active Projects */}
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Active Projects</CardTitle>
              <Link href="/projects" className="text-sm text-primary hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeProjects.slice(0, 4).map(project => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <div className="group p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-all cursor-pointer">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg shrink-0 shadow-sm" style={{ background: project.thumbnail }} />
                          <div>
                            <div className="font-semibold group-hover:text-primary transition-colors">{project.name}</div>
                            <div className="text-xs text-muted-foreground">{project.client}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className={
                          project.status === 'ON_TRACK' ? 'text-green-500 border-green-500/20 bg-green-500/5' :
                          project.status === 'AT_RISK' ? 'text-orange-500 border-orange-500/20 bg-orange-500/5' :
                          'text-red-500 border-red-500/20 bg-red-500/5'
                        }>
                          {project.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground font-medium">Progress</span>
                          <span className="font-semibold">{project.progress}%</span>
                        </div>
                        <Progress value={project.progress} className="h-2 bg-muted" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Right Column */}
        <div className="space-y-6">
          {/* AI Insights Module */}
          <Card className="border-indigo-500/50 bg-indigo-500/5 overflow-hidden">
            <div className="bg-indigo-500/20 p-3 flex items-center gap-2 border-b border-indigo-500/30">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="font-semibold text-indigo-400">Forge AI Insights</h3>
            </div>
            <CardContent className="p-4 space-y-4">
              <div className="flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Bottleneck Warning: Animation Dept</div>
                  <div className="text-xs text-muted-foreground mt-1">Velocity dropped by 24% this week. Project "Leo&Loona" is forecasted to miss Milestone 03 by 4 days based on current capacity.</div>
                  <Button variant="outline" size="sm" className="mt-2 h-7 text-xs border-orange-500/50 text-orange-500">Auto-Rebalance Load</Button>
                </div>
              </div>
              <div className="border-t border-border/50 pt-4 flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Optimization Found: Render Nodes</div>
                  <div className="text-xs text-muted-foreground mt-1">Found 12 idle GPU nodes in Region B. Automatically routing low-priority LookDev renders to save time.</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Planner vs Actual (Deadlines vs Status) */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Planner vs Actual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { task: 'Shot 032 Anim', planned: 'Oct 12', actual: 'Oct 14', status: 'Delayed', color: 'text-red-500' },
                { task: 'VFX Sim Rig', planned: 'Oct 10', actual: 'Oct 09', status: 'Ahead', color: 'text-green-500' },
                { task: 'Env Lighting', planned: 'Oct 15', actual: 'Oct 15', status: 'On Track', color: 'text-blue-500' },
                { task: 'Main Char Roto', planned: 'Oct 11', actual: 'Oct 13', status: 'Delayed', color: 'text-red-500' }
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-center border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <div>
                    <div className="font-medium text-sm">{item.task}</div>
                    <div className="text-xs text-muted-foreground">Deadline: {item.planned}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold text-sm ${item.color}`}>{item.status}</div>
                    <div className="text-xs text-muted-foreground">Est: {item.actual}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          {/* Quick Review Panel */}
          <Card className="border-border/50 bg-gradient-to-b from-card to-muted/20">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Quick Review Queue</span>
                <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/20">12 Pending</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {[
                { shot: 'S01_040', project: 'Starfall', dept: 'Animation', status: 'Internal Review', submitter: 'Nadia S.' },
                { shot: 'EP03_010', project: 'NeonFlix', dept: 'Compositing', status: 'Client Review', submitter: 'Zoe P.' },
                { shot: 'S02_090', project: 'Starfall', dept: 'FX', status: 'Internal Review', submitter: 'Rafi K.' },
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-center group cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-7 rounded bg-muted flex items-center justify-center shrink-0 border border-border group-hover:border-primary/50 transition-colors">
                      <PlayCircle className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm group-hover:text-primary transition-colors">{item.shot} <span className="text-muted-foreground font-normal ml-1">({item.project})</span></div>
                      <div className="text-xs text-muted-foreground">{item.dept} • {item.submitter}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className={item.status === 'Client Review' ? 'text-pink-500 border-pink-500/30 bg-pink-500/10' : 'text-purple-500 border-purple-500/30 bg-purple-500/10'}>
                    {item.status}
                  </Badge>
                </div>
              ))}
              <Button variant="outline" className="w-full text-xs h-8 mt-2">View All Pending Reviews</Button>
            </CardContent>
          </Card>

        </div>

      </div>
    </div>
  );
}

// --- Supervisor Dashboard (Department Focus) ---
function SupervisorDashboard({ currentUser }: { currentUser: any }) {
  const dept = DEPARTMENTS.find(d => d.id === currentUser.departmentId);
  const deptTeam = USERS.filter(u => u.departmentId === dept?.id);
  const deptTasks = TASKS.filter(t => t.department === dept?.name);
  const activeTasks = deptTasks.filter(t => t.status === 'in-progress');
  const reviewTasks = deptTasks.filter(t => t.status === 'lead-review' || t.status === 'manager-review');
  const { setActiveTaskDrawer } = useUIStore();

  if (!dept) return null;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Department Dashboard</h1>
          <p className="text-muted-foreground mt-1">{dept.name} • Lead: {currentUser.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><ListTodo className="w-4 h-4 mr-2" /> Assign Tasks</Button>
          <Link href="/daily-standup">
            <Button className="bg-primary text-primary-foreground">Daily Standup</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Team Members', value: deptTeam.length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Active Tasks', value: activeTasks.length, icon: ListTodo, color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Needs Review', value: reviewTasks.length, icon: PlayCircle, color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'Avg Velocity', value: '4.2', sub: 'tasks/day', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        ].map((s, i) => (
          <Card key={i} className="border-border/50 bg-card hover:bg-muted/20 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`w-6 h-6 ${s.color}`} />
              </div>
              <div>
                <div className="text-2xl font-bold">{s.value} <span className="text-xs font-normal text-muted-foreground">{s.sub}</span></div>
                <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Pending Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {reviewTasks.slice(0, 5).map(task => {
                const assignee = USERS.find(u => u.id === task.assigneeId);
                return (
                  <div key={task.id} className="py-3 flex items-center justify-between hover:bg-muted/30 -mx-4 px-4 transition-colors cursor-pointer" onClick={() => setActiveTaskDrawer(task.id)}>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={assignee?.avatar} />
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">{task.title}</div>
                        <div className="text-xs text-muted-foreground">Submitted by {assignee?.name}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-purple-500 border-purple-500/20 bg-purple-500/5">Ready for Review</Badge>
                  </div>
                )
              })}
              {reviewTasks.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No tasks pending review.</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Team Capacity (Next 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {deptTeam.slice(0, 6).map(member => (
                <div key={member.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{member.name}</span>
                    <span className={member.capacity > 90 ? 'text-red-500' : 'text-muted-foreground'}>{member.capacity}% Booked</span>
                  </div>
                  <Progress value={member.capacity} className={`h-1.5 ${member.capacity > 90 ? 'bg-red-500/20 [&>div]:bg-red-500' : ''}`} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// --- Artist Dashboard (Personal Tasks Focus) ---
function ArtistDashboard({ currentUser }: { currentUser: any }) {
  const myTasks = TASKS.filter(t => t.assigneeId === currentUser.id);
  const activeTasks = myTasks.filter(t => t.status === 'in-progress' || t.status === 'todo');
  const myReviews = REVIEWS.filter(r => r.reviewerId === currentUser.id && r.status === 'pending');
  const { setActiveTaskDrawer } = useUIStore();
  const { toast } = useToast();

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Workspace</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {currentUser.name}</p>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'My Active Tasks', value: activeTasks.length, icon: ListTodo, color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Completed (This Week)', value: myTasks.filter(t => t.status === 'approved').length, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: 'Reviews Requested', value: myReviews.length, icon: PlayCircle, color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'Total Hours Logged', value: '32h', icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10' },
        ].map((s, i) => (
          <Card key={i} className="border-border/50 bg-card hover:bg-muted/20 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`w-6 h-6 ${s.color}`} />
              </div>
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">My Current Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {activeTasks.slice(0, 6).map(task => (
                  <div key={task.id} className="py-4 flex items-center justify-between hover:bg-muted/30 -mx-4 px-4 transition-colors cursor-pointer" onClick={() => setActiveTaskDrawer(task.id)}>
                    <div className="flex items-center gap-4">
                      <StatusBadge status={task.status} />
                      <div>
                        <div className="font-semibold text-sm hover:text-primary transition-colors">{task.title}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <Clock className="w-3 h-3" /> Due {new Date(task.dueDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <PriorityChip priority={task.priority} />
                  </div>
                ))}
                {activeTasks.length === 0 && <div className="text-center py-8 text-muted-foreground">You have no active tasks.</div>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><Upload className="w-5 h-5 text-primary" /> Quick Publish</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">Drag and drop files to instantly publish to your active task.</p>
                <div className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center text-center hover:bg-muted/30 transition-colors cursor-pointer group">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <div className="font-semibold mb-1">Click or drag file to this area</div>
                  <div className="text-xs text-muted-foreground">Supports .mov, .mp4, .usd, .png (Max 2GB)</div>
                </div>
                <Button className="w-full" onClick={() => {
                  toast({ title: 'Upload Started', description: 'Your file is being published to the pipeline.' });
                }}>Browse Files</Button>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-500" /> Recent Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {myReviews.slice(0, 3).map(r => (
                  <div key={r.id} className="p-3 bg-card border border-border rounded-md text-sm">
                    <div className="font-medium text-foreground mb-1">Version {r.id.split('_')[1] || 'v001'}</div>
                    <div className="text-muted-foreground line-clamp-2">"Please adjust the rim light intensity. It's blowing out the character's shoulder on frame 102." - Supervisor</div>
                  </div>
                ))}
                {myReviews.length === 0 && <div className="text-sm text-muted-foreground">No recent feedback.</div>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- Main Router ---
export default function Home() {
  const { currentUser } = useAuthStore();
  
  if (!currentUser) return null;

  if (['vfx_producer', 'production_manager', 'coordinator'].includes(currentUser.role)) {
    return <ProducerDashboard />;
  } else if (['supervisor', 'lead'].includes(currentUser.role)) {
    return <SupervisorDashboard currentUser={currentUser} />;
  } else {
    return <ArtistDashboard currentUser={currentUser} />;
  }
}
