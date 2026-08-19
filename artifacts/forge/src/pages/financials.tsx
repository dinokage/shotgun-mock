import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { PROJECTS, DEPARTMENTS, Project } from '@/data/mockData';
import { useTasksStore } from '@/store/tasks';
import { DollarSign, TrendingUp, TrendingDown, Users, Briefcase, Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { motion, animate } from 'framer-motion';
import { ScopeTrace } from '@/components/shared/ScopeTrace';
import { hashString, seededFraction } from '@/lib/seededMock';
import { useCapability } from '@/hooks/use-capability';

// ============================================================================
// Deterministic mock financial model
//
// Every dollar figure on this page is a *pure function* of a project's real
// mock fields (budget, progress, riskScore, status, startDate) plus a stable
// per-project seed derived from a hash of the project id. The same project
// always produces the same spent/remaining/burn numbers on every render -
// nothing here is reshuffled by Math.random(). hashString/seededFraction
// live in src/lib/seededMock.ts, shared with analytics.tsx's bid-margin math
// so the two pages can't silently drift out of sync with each other.
// ============================================================================

// Fictional "today" this studio's books are closed against. The rest of the
// mock dataset (task logs, activity feeds, status updates) lives in and
// around Sept/Oct 2024, so burn-rate math is anchored there too instead of
// drifting with the real-world calendar.
const MOCK_TODAY = new Date('2024-10-15');

interface ProjectFinancials {
  spent: number;
  remaining: number;
  percentSpent: number; // can exceed 100 for over-budget projects
  monthlyBurn: number;
  isOverBudget: boolean;
}

/**
 * Derives spend figures for a project from fields that already exist on it:
 *  - progress:  how much of the show is actually done (drives baseline spend)
 *  - riskScore: riskier shows tend to run hotter relative to progress
 *  - status:    wrapped projects settle near ~100% of budget
 *  - id (hash): a small, stable per-project jitter so otherwise-similar
 *               projects don't all land on an identical curve
 */
function getProjectFinancials(p: Project): ProjectFinancials {
  const budget = p.budget || 0;
  const seed = hashString(p.id);
  const jitter = seededFraction(seed, 7); // stable per-project value in [0,1)

  const progressFactor = p.progress / 100;
  const riskPremium = (p.riskScore / 100) * 0.45; // up to +45% spend pressure at max risk
  const jitterSpread = (jitter - 0.5) * 0.18; // +/-9%, keeps projects visually distinct

  let spendRatio = progressFactor * (0.82 + riskPremium) + jitterSpread;
  if (p.status === 'COMPLETE') {
    spendRatio = 0.92 + jitter * 0.16; // wrapped shows settle close to fully spent
  }
  spendRatio = Math.max(0.04, Math.min(1.35, spendRatio));

  const spent = budget * spendRatio;
  const start = new Date(p.startDate);
  const monthsElapsed = Math.max(
    1,
    (MOCK_TODAY.getFullYear() - start.getFullYear()) * 12 + (MOCK_TODAY.getMonth() - start.getMonth())
  );

  return {
    spent,
    remaining: budget - spent,
    percentSpent: spendRatio * 100,
    monthlyBurn: spent / monthsElapsed,
    isOverBudget: spendRatio > 1,
  };
}

const SPEND_TREND_STEPS = 10;

/**
 * Studio-wide cumulative spend, sampled at N even checkpoints across the
 * production window (earliest project start-date -> MOCK_TODAY). Each
 * project contributes its own deterministic spend total (getProjectFinancials
 * above) ramped across its own start->today window, with a small
 * per-checkpoint jitter seeded off the project id + step index — the same
 * seededFraction model the rest of this page's mock numbers use, not
 * fabricated noise. Feeds the ScopeTrace sparkline on the KPI cards below.
 */
function getStudioSpendTrend(projects: Project[], financials: Map<string, ProjectFinancials>, steps = SPEND_TREND_STEPS): number[] {
  if (projects.length === 0) return [];
  const todayTime = MOCK_TODAY.getTime();
  const earliestStart = Math.min(...projects.map(p => new Date(p.startDate).getTime()));
  const span = Math.max(1, todayTime - earliestStart);

  const series: number[] = [];
  for (let step = 0; step < steps; step++) {
    const checkpointTime = earliestStart + (span * step) / (steps - 1);
    let total = 0;
    projects.forEach(p => {
      const pf = financials.get(p.id);
      if (!pf) return;
      const start = new Date(p.startDate).getTime();
      if (checkpointTime <= start) return; // project hadn't started yet at this checkpoint
      const projectSpan = Math.max(1, todayTime - start);
      const elapsedFrac = Math.min(1, (checkpointTime - start) / projectSpan);
      const seed = hashString(p.id);
      const jitter = (seededFraction(seed, 200 + step) - 0.5) * 0.06; // +/-3%, keeps the ramp from being dead-straight
      const frac = Math.max(0, Math.min(1, elapsedFrac + jitter));
      total += pf.spent * frac;
    });
    series.push(total);
  }
  return series;
}

/** Marginal spend per checkpoint - a burn-rate proxy derived from the cumulative trend above. */
function toDeltaSeries(series: number[]): number[] {
  if (series.length < 2) return series;
  return series.slice(1).map((v, i) => v - series[i]);
}

// --- Count-up number reveal --------------------------------------------------

function useCountUp(target: number, duration = 1.1) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, target, { duration, ease: 'easeOut', onUpdate: setDisplay });
    return () => controls.stop();
  }, [target, duration]);
  return display;
}

function CountUp({ value, format, duration }: { value: number; format: (n: number) => string; duration?: number }) {
  const display = useCountUp(value, duration);
  return <>{format(display)}</>;
}

export default function FinancialDashboard() {
  const tasks = useTasksStore(state => state.tasks);
  const canViewFinancials = useCapability('view_financials');

  const projectFinancials = useMemo(() => {
    const map = new Map<string, ProjectFinancials>();
    PROJECTS.forEach(p => map.set(p.id, getProjectFinancials(p)));
    return map;
  }, []);

  const totalBudget = useMemo(() => PROJECTS.reduce((acc, p) => acc + (p.budget || 0), 0), []);
  const totalSpent = useMemo(
    () => PROJECTS.reduce((acc, p) => acc + (projectFinancials.get(p.id)?.spent || 0), 0),
    [projectFinancials]
  );
  const overallPercentSpent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const activeProjects = useMemo(() => PROJECTS.filter(p => p.status !== 'COMPLETE'), []);
  const totalMonthlyBurn = useMemo(
    () => activeProjects.reduce((acc, p) => acc + (projectFinancials.get(p.id)?.monthlyBurn || 0), 0),
    [activeProjects, projectFinancials]
  );

  // Scope-trace sparklines for the KPI cards - cumulative spend trend, and its
  // marginal (burn-rate) derivative. See getStudioSpendTrend for how these
  // are derived from real project fields rather than fabricated.
  const spendTrend = useMemo(() => getStudioSpendTrend(PROJECTS, projectFinancials), [projectFinancials]);
  const burnTrend = useMemo(() => toDeltaSeries(spendTrend), [spendTrend]);

  // Department spend derived from real logged task hours (estimated vs actual),
  // not a random percentage - a department that has logged more actual hours
  // against its bid hours shows a proportionally larger burn.
  const departmentSpend = useMemo(() => {
    return DEPARTMENTS.slice(0, 6).map(d => {
      const deptTasks = tasks.filter(t => t.department === d.name);
      const estimatedHours = deptTasks.reduce((acc, t) => acc + (t.estimatedHours || 0), 0);
      const actualHours = deptTasks.reduce((acc, t) => acc + (t.actualHours || 0), 0);
      const percent = estimatedHours > 0 ? (actualHours / estimatedHours) * 100 : 0;
      return { ...d, percent, estimatedHours, actualHours };
    });
  }, [tasks]);

  // Leadership passes the coarse route-level LeadershipGuard, but not every
  // leadership role carries view_financials in the real, editable Roles &
  // Permissions matrix (e.g. supervisor/lead can lead a show without seeing
  // its budget) - gate the dashboard itself on the specific capability.
  if (!canViewFinancials) {
    return (
      <div className="p-8 h-[calc(100vh-3.5rem)] overflow-auto bg-background text-foreground flex items-center justify-center">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lock />
            </EmptyMedia>
            <EmptyTitle>Financials access restricted</EmptyTitle>
            <EmptyDescription>
              Your role doesn't include View Financials in the current Roles &amp; Permissions scheme. Ask a producer or
              manager to grant access under Settings &gt; Roles.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="p-8 h-[calc(100vh-3.5rem)] overflow-auto bg-background text-foreground">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Financial Overview</h1>
        <p className="text-muted-foreground mt-2">Studio budget and cost tracking, derived from each project's real progress and risk profile.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 350, damping: 22 }}>
          <Card className="bg-card border-border transition-colors hover:border-primary/40 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground tabular-nums">
                <CountUp value={totalBudget} format={n => `$${(n / 1000000).toFixed(1)}M`} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                <Briefcase className="w-3 h-3 text-blue-500 mr-1" /> Across {PROJECTS.length} projects
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 350, damping: 22 }}>
          <Card className="bg-card border-border transition-colors hover:border-primary/40 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground tabular-nums">
                <CountUp value={totalSpent} format={n => `$${(n / 1000000).toFixed(1)}M`} />
              </div>
              <div className="h-7 w-full mt-2">
                <ScopeTrace data={spendTrend} area />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{overallPercentSpent.toFixed(0)}% of total budget &middot; spend trend across the studio</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 350, damping: 22 }}>
          <Card className="bg-card border-border transition-colors hover:border-primary/40 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
              <Briefcase className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground tabular-nums">
                <CountUp value={activeProjects.length} format={n => Math.round(n).toString()} duration={0.6} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Across 3 studios &middot; {PROJECTS.length} total</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 350, damping: 22 }}>
          <Card className="bg-card border-border transition-colors hover:border-primary/40 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Burn Rate</CardTitle>
              <Users className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground tabular-nums">
                <CountUp value={totalMonthlyBurn} format={n => `$${Math.round(n / 1000)}k/mo`} />
              </div>
              <div className="h-6 w-full mt-2">
                <ScopeTrace data={burnTrend} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                <TrendingUp className="w-3 h-3 text-orange-500 mr-1" /> Blended across {activeProjects.length} active projects
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Budget by Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {PROJECTS.map((p, i) => {
                const pf = projectFinancials.get(p.id)!;
                const barPercent = Math.min(pf.percentSpent, 100);
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.04, ease: 'easeOut' }}
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className={`font-mono text-xs ${pf.isOverBudget ? 'text-red-400' : 'text-muted-foreground'}`}>
                        ${(pf.spent / 1000000).toFixed(1)}M / ${((p.budget || 0) / 1000000).toFixed(1)}M
                      </span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${pf.percentSpent > 90 ? 'bg-red-500' : pf.percentSpent > 75 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${barPercent}%` }}
                        transition={{ duration: 0.8, delay: i * 0.04, ease: 'easeOut' }}
                      />
                    </div>
                    {pf.isOverBudget && (
                      <div className="text-[10px] text-red-400 mt-1">Over budget by ${Math.abs(pf.remaining / 1000).toFixed(0)}k</div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Department Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {departmentSpend.map((d, i) => (
                <motion.div
                  key={d.id}
                  className="flex items-center gap-4"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.05, ease: 'easeOut' }}
                >
                  <div className="w-24 text-sm font-medium text-muted-foreground truncate">{d.name}</div>
                  <div className="flex-1 bg-muted h-4 rounded overflow-hidden" title={`${d.actualHours}h logged / ${d.estimatedHours}h bid`}>
                    <motion.div
                      className={`h-full ${d.percent > 100 ? 'bg-red-500/80' : d.percent > 80 ? 'bg-orange-500/80' : 'bg-blue-500/80'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(d.percent, 100)}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05, ease: 'easeOut' }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs text-muted-foreground font-mono tabular-nums">
                    <CountUp value={d.percent} format={n => `${n.toFixed(0)}%`} duration={0.8} />
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Bidding vs Actual (Task-wise)</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <Empty className="border-0 py-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <DollarSign />
                  </EmptyMedia>
                  <EmptyTitle>No task cost data yet</EmptyTitle>
                  <EmptyDescription>Bid vs. actual figures will appear here once tasks exist.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="h-10 px-4 text-left font-medium w-[40%]">Task</th>
                    <th className="h-10 px-4 text-left font-medium">Department</th>
                    <th className="h-10 px-4 text-left font-medium">Status</th>
                    <th className="h-10 px-4 text-right font-medium">Bid (Days)</th>
                    <th className="h-10 px-4 text-right font-medium">Actual (Days)</th>
                    <th className="h-10 px-4 text-right font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tasks.slice(0, 10).map((task, i) => {
                    // Consistent mock bid/actual data, seeded from real task fields.
                    const bidDays = (hashString(task.id) % 10) + 2;
                    let actualDays = bidDays;

                    if (task.status === 'complete') {
                      actualDays = bidDays + ((hashString(task.title) % 5) - 2);
                    } else if (task.status === 'in-progress' || task.status === 'bottleneck') {
                      actualDays = Math.floor(bidDays * 1.5);
                    } else {
                      actualDays = 0;
                    }

                    // Prevent negative actual days
                    actualDays = Math.max(0, actualDays);

                    const variance = bidDays - actualDays;
                    const isOverBudget = variance < 0 && actualDays > 0;

                    return (
                      <motion.tr
                        key={task.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.03, ease: 'easeOut' }}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="p-4">
                          <div className="font-medium text-foreground">{task.title}</div>
                        </td>
                        <td className="p-4 text-muted-foreground">{task.department}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-[10px] uppercase font-semibold ${
                            task.status === 'complete' ? 'bg-emerald-500/10 text-emerald-500' :
                            task.status === 'in-progress' ? 'bg-amber-500/10 text-amber-500' :
                            task.status === 'bottleneck' ? 'bg-red-500/10 text-red-500' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {task.status.replace('-', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right text-muted-foreground">{bidDays}d</td>
                        <td className="p-4 text-right text-foreground font-medium">{actualDays > 0 ? `${actualDays}d` : '-'}</td>
                        <td className={`p-4 text-right font-medium ${isOverBudget ? 'text-red-500' : variance > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {actualDays === 0 ? '-' : (variance > 0 ? `+${variance}d` : `${variance}d`)}
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
