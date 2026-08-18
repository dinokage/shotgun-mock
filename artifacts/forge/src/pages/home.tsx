import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { useProjectStore } from '@/store/projects';
import { useTasksStore } from '@/store/tasks';
import { useShotStore } from '@/store/shots';
import { useReviewStore } from '@/store/reviews';
import { USERS, ASSETS, PUBLISH_LOGS, DEPARTMENTS, Project } from '@/data/mockData';
import { generateProducerInsights, type AIInsight } from '@/lib/aiInsights';
import { useToast } from '@/hooks/use-toast';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { stagger } from '@/lib/motion';
import { ScopeTrace } from '@/components/shared/ScopeTrace';
import {
  FolderOpen, Users, ListTodo, PlayCircle, Upload, TrendingUp, AlertTriangle,
  BarChart3, Workflow, ArrowRight, CheckCircle2, Clock, Plus,
  Sparkles, Activity, Shield, Film, Package, Building2, AlertCircle
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PriorityChip } from '@/components/shared/PriorityChip';

const INSIGHT_SEVERITY_STYLES: Record<AIInsight['severity'], { icon: typeof AlertTriangle; iconColor: string; buttonColor: string }> = {
  critical: { icon: AlertTriangle, iconColor: 'text-orange-400', buttonColor: 'border-orange-500/50 text-orange-500' },
  warning: { icon: AlertCircle, iconColor: 'text-amber-400', buttonColor: 'border-amber-500/50 text-amber-500' },
  positive: { icon: CheckCircle2, iconColor: 'text-emerald-400', buttonColor: 'border-emerald-500/50 text-emerald-500' },
};

// ============================================================================
// Planner vs Actual — deterministic schedule-variance model
//
// Same hash-seeded approach as src/pages/financials.tsx's mock financial
// model: schedule drift is a pure function of a project's real progress and
// riskScore fields (plus a stable per-project seed), not a hand-written
// static list. Riskier projects that are further from done drift later;
// low-risk, near-complete projects land on time or ahead.
// ============================================================================

/** Stable string hash - mirrors the algorithm used in financials.tsx. */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  return Math.abs(hash);
}

/** Deterministic pseudo-random float in [0, 1), seeded by a hash + a salt. */
function seededFraction(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const SCHEDULE_HISTORY_POINTS = 8;

interface ScheduleVariance {
  varianceDays: number; // negative = ahead, positive = delayed
  status: 'Delayed' | 'Ahead' | 'On Track';
  color: string;
  history: number[]; // drift trend leading up to varianceDays, for the ScopeTrace
}

function getScheduleVariance(project: Project): ScheduleVariance {
  const seed = hashString(project.id);
  const jitter = seededFraction(seed, 11);

  // Riskier projects drift later; well past halfway with low risk lands early.
  const riskFactor = (project.riskScore - 50) / 50; // -1..1
  const varianceDays = Math.round(riskFactor * 6 + (jitter - 0.5) * 4);

  const history: number[] = [];
  for (let i = 0; i < SCHEDULE_HISTORY_POINTS; i++) {
    const frac = i / (SCHEDULE_HISTORY_POINTS - 1);
    // Drift ramps in step with the project's own reported progress, not a flat line.
    const progressFrac = Math.min(1, frac * (project.progress / 100 + 0.15));
    const stepJitter = (seededFraction(seed, 200 + i) - 0.5) * 1.5;
    history.push(varianceDays * progressFrac + stepJitter);
  }
  history[history.length - 1] = varianceDays; // anchor the trace on the authoritative current value

  const status = varianceDays > 1 ? 'Delayed' : varianceDays < -1 ? 'Ahead' : 'On Track';
  const color = status === 'Delayed' ? 'text-red-500' : status === 'Ahead' ? 'text-green-500' : 'text-blue-500';

  return { varianceDays, status, color, history };
}

// --- Producer Dashboard (Studio-Wide Overview) ---
function ProducerDashboard() {
  const [, setLocation] = useLocation();
  const { setCreateProjectModalOpen } = useUIStore();
  // Store-backed, not the static mock array — so a project created via the
  // "New Project" modal (or a task added elsewhere) shows up here immediately,
  // for every user, with no reload. Same pattern as projects.tsx.
  const projects = useProjectStore((state) => state.projects);
  const tasks = useTasksStore((state) => state.tasks);
  const shots = useShotStore((state) => state.shots);
  const activeProjects = projects.filter(p => p.status !== 'COMPLETE');
  const activeTasks = tasks.filter(t => t.status === 'in-progress' || t.status === 'lead-review' || t.status === 'manager-review').length;
  // Recomputed from the current mock data on every mount — not hand-written copy.
  // See src/lib/aiInsights.ts for the rule-based logic behind each card.
  const insights = useMemo(() => generateProducerInsights(), []);

  // Review queue — real shots currently sitting in internal or client review.
  // Single source of truth for both the "Pending Client Reviews" stat and the
  // Quick Review Queue panel below, so the two numbers never disagree.
  const reviewQueueShots = useMemo(
    () => shots.filter(s => s.status === 'review' || s.status === 'client-review'),
    [shots]
  );
  const pendingClientReviews = useMemo(
    () => shots.filter(s => s.status === 'client-review' || s.clientReviewStatus === 'pending').length,
    [shots]
  );

  // Quick Review Queue — real shots currently sitting in internal or client
  // review, not hand-written placeholder rows, so the row both reads
  // correctly and actually goes somewhere when clicked.
  const quickReviewShots = useMemo(() => {
    return reviewQueueShots
      .slice(0, 3)
      .map(s => {
        const project = projects.find(p => p.id === s.projectId);
        const assignee = USERS.find(u => u.id === s.assigneeId);
        const dept = DEPARTMENTS.find(d => d.id === assignee?.departmentId);
        return {
          id: s.id,
          shot: s.name,
          project: project?.name || 'Unknown',
          dept: dept?.name || 'Unassigned',
          status: s.status === 'client-review' ? 'Client Review' : 'Internal Review',
          submitter: assignee?.name || 'Unassigned',
        };
      });
  }, [reviewQueueShots, projects]);

  // Active Shots / Sequences — shots not yet in a terminal (complete/approved/
  // published) state, and the count of distinct sequences (via the shot's own
  // `sequenceId` field) those active shots belong to.
  const activeShots = useMemo(
    () => shots.filter(s => !['complete', 'approved', 'published'].includes(s.status)),
    [shots]
  );
  const activeSequenceCount = useMemo(
    () => new Set(activeShots.map(s => s.sequenceId)).size,
    [activeShots]
  );

  // Planner vs Actual — real active projects, nearest-due first, each with a
  // deterministic schedule-variance trend (see getScheduleVariance above).
  const plannerRows = useMemo(() => {
    return [...activeProjects]
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 4)
      .map(project => {
        const variance = getScheduleVariance(project);
        const actualDate = new Date(project.dueDate);
        actualDate.setDate(actualDate.getDate() + variance.varianceDays);
        return { project, variance, actualDate };
      });
  }, [activeProjects]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Studio Overview</h1>
          <p className="text-muted-foreground mt-1">Global production health and metrics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="hidden sm:flex" onClick={() => setLocation('/production')}><Activity className="w-4 h-4 mr-2" /> Pipeline Status</Button>
          <Button className="bg-accent-tally text-accent-tally-foreground hover:bg-accent-tally/90" onClick={() => setCreateProjectModalOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Project</Button>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Projects', value: activeProjects.length, icon: FolderOpen, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Active Shots / Sequences', value: `${activeShots.length} / ${activeSequenceCount}`, icon: ListTodo, color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Pending Client Reviews', value: pendingClientReviews, icon: Activity, color: 'text-pink-500', bg: 'bg-pink-500/10' },
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
              <Link href="/projects" className="text-sm text-accent-scope hover:underline flex items-center">
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
        <div className="space-y-6 sticky top-0 self-start h-[calc(100vh-12rem)] overflow-y-auto pr-2 custom-scrollbar pb-10">
          {/* AI Insights Module — rule-based cards computed from live mock-data relationships (dependency fan-out, weeklyRating, riskScore). See src/lib/aiInsights.ts. */}
          <Card className="border-indigo-500/50 bg-indigo-500/5 overflow-hidden">
            <div className="bg-indigo-500/20 p-3 flex items-center gap-2 border-b border-indigo-500/30">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="font-semibold text-indigo-400">Forge AI Insights</h3>
            </div>
            <CardContent className="p-4">
              {insights.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">No anomalies detected in the current data.</div>
              ) : (
                <div className="space-y-4">
                  {insights.map((insight, i) => {
                    const style = INSIGHT_SEVERITY_STYLES[insight.severity];
                    const Icon = style.icon;
                    return (
                      <motion.div
                        key={insight.id}
                        {...stagger(i)}
                        className={`group flex gap-3 items-start -mx-2 px-2 py-1 rounded-md transition-colors hover:bg-white/[0.03] ${i > 0 ? 'border-t border-border/50 pt-4' : ''}`}
                      >
                        <Icon className={`w-5 h-5 ${style.iconColor} mt-0.5 shrink-0`} />
                        <div className="min-w-0">
                          <div className="font-medium text-sm group-hover:text-foreground transition-colors">{insight.title}</div>
                          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.reasoning}</div>
                          <Link href={insight.actionHref}>
                            <Button variant="outline" size="sm" className={`mt-2 h-7 text-xs ${style.buttonColor}`}>
                              {insight.actionLabel}
                              <ArrowRight className="w-3 h-3 ml-1 transition-transform group-hover:translate-x-0.5" />
                            </Button>
                          </Link>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Planner vs Actual (Deadlines vs Status) — derived from real active
              projects' progress/riskScore, see getScheduleVariance above. */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Planner vs Actual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {plannerRows.map(({ project, variance, actualDate }) => (
                <div key={project.id} className="flex justify-between items-center gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{project.name}</div>
                    <div className="text-xs text-muted-foreground">Deadline: {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    <div className="h-5 w-24 mt-1.5">
                      <ScopeTrace data={variance.history} strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-semibold text-sm ${variance.color}`}>{variance.status}</div>
                    <div className="text-xs text-muted-foreground">Est: {actualDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </div>
                </div>
              ))}
              {plannerRows.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">No active projects to track.</div>
              )}
            </CardContent>
          </Card>
          {/* Quick Review Panel */}
          <Card className="border-border/50 bg-gradient-to-b from-card to-muted/20">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Quick Review Queue</span>
                <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/20">{reviewQueueShots.length} Pending</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {quickReviewShots.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center group cursor-pointer"
                  onClick={() => setLocation(`/shots/${item.id}`)}
                >
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
              <Button variant="outline" className="w-full text-xs h-8 mt-2" onClick={() => setLocation('/review')}>View All Pending Reviews</Button>
            </CardContent>
          </Card>

        </div>

      </div>
    </div>
  );
}

/** Title-cases a snake_case role id, e.g. 'senior_artist' -> 'Senior Artist'. */
function formatRoleLabel(role: string): string {
  return role
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// --- Supervisor Dashboard (Department Focus) ---
function SupervisorDashboard({ currentUser }: { currentUser: any }) {
  const tasks = useTasksStore((state) => state.tasks);
  const dept = DEPARTMENTS.find(d => d.id === currentUser.departmentId);
  const deptTeam = USERS.filter(u => u.departmentId === dept?.id);
  const deptTasks = tasks.filter(t => t.department === dept?.name);
  const activeTasks = deptTasks.filter(t => t.status === 'in-progress');
  const reviewTasks = deptTasks.filter(t => t.status === 'lead-review' || t.status === 'manager-review');
  const { setActiveTaskDrawer } = useUIStore();

  // Avg Velocity — real throughput: completed dept tasks divided by the
  // number of distinct calendar days the department actually logged work on
  // (via each task's dailyLogs), not a hand-written "4.2".
  const completedDeptTasks = deptTasks.filter(t => t.status === 'complete' || t.status === 'approved').length;
  const deptWorkDays = new Set(
    deptTasks.flatMap(t => t.dailyLogs.map(log => log.date.split('T')[0]))
  ).size;
  const avgVelocity = deptWorkDays > 0 ? (completedDeptTasks / deptWorkDays).toFixed(1) : '0.0';

  if (!dept) return null;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Department Dashboard</h1>
          <p className="text-muted-foreground mt-1">{dept.name} • {formatRoleLabel(currentUser.role)}: {currentUser.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><ListTodo className="w-4 h-4 mr-2" /> Assign Tasks</Button>
          <Link href="/daily-standup">
            <Button className="bg-accent-tally text-accent-tally-foreground hover:bg-accent-tally/90">Daily Standup</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Team Members', value: deptTeam.length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Active Tasks', value: activeTasks.length, icon: ListTodo, color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Needs Review', value: reviewTasks.length, icon: PlayCircle, color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'Avg Velocity', value: avgVelocity, sub: 'tasks/day', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
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

        <Card className="border-border/50 sticky top-0 self-start">
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
  const tasks = useTasksStore((state) => state.tasks);
  const reviews = useReviewStore((state) => state.reviews);
  const myTasks = tasks.filter(t => t.assigneeId === currentUser.id);
  const activeTasks = myTasks.filter(t => t.status === 'in-progress' || t.status === 'todo');
  const myReviews = reviews.filter(r => r.reviewerId === currentUser.id && r.status === 'pending');
  const { setActiveTaskDrawer } = useUIStore();
  const { toast } = useToast();

  // Total Hours Logged — real sum of this artist's own dailyLogs entries
  // across their tasks, not a hand-written "32h".
  const totalHoursLogged = myTasks.reduce(
    (sum, t) => sum + t.dailyLogs.filter(log => log.userId === currentUser.id).reduce((s, log) => s + log.hours, 0),
    0
  );

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
          { label: 'Total Hours Logged', value: `${totalHoursLogged}h`, icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10' },
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


          <Card className="border-border/50 bg-muted/20 sticky top-0 self-start">
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
