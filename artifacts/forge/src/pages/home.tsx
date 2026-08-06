import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { USERS, PROJECTS, TASKS, SHOTS, ASSETS, REVIEWS, PUBLISH_LOGS, AI_SUGGESTIONS, DEPARTMENTS } from '@/data/mockData';
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
  const activeTasks = TASKS.filter(t => t.status === 'in-progress' || t.status === 'review').length;
  const criticalSuggestions = AI_SUGGESTIONS.filter(s => s.severity === 'CRITICAL');
  
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
          { label: 'Total Artists', value: USERS.length, icon: Users, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: 'Active Tasks', value: activeTasks, icon: ListTodo, color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Pipeline Health', value: '94%', icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
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

        <div className="space-y-6">
          {/* AI Suggestions (Studio Level) */}
          <Card className="border-purple-500/20 bg-purple-500/5 shadow-[0_0_15px_rgba(168,85,247,0.05)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                AI Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {criticalSuggestions.slice(0, 3).map(suggestion => (
                <div key={suggestion.id} className="p-3 bg-card border border-border/50 rounded-lg text-sm">
                  <div className="flex items-center gap-2 font-medium mb-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    {suggestion.title}
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed mb-2">{suggestion.description}</p>
                  <Button variant="secondary" size="sm" className="w-full text-xs h-7">Take Action</Button>
                </div>
              ))}
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
  const reviewTasks = deptTasks.filter(t => t.status === 'review');
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
          { label: 'Completed (This Week)', value: myTasks.filter(t => t.status === 'complete').length, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
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
            <CardHeader>
              <CardTitle className="text-lg">Daily Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>Log your hours and blockers for today's standup.</p>
                <textarea 
                  className="w-full h-24 bg-card border border-border rounded-md p-3 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="What did you work on today?"
                />
                <Button className="w-full">Submit Log</Button>
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
