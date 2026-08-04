import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROJECTS, TASKS, REVIEWS, PUBLISH_LOGS, DEPARTMENTS, USERS } from '@/data/mockData';
import { BarChart3, TrendingUp, Clock, CheckCircle2, AlertTriangle, Users, Download, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Analytics() {
  const { toast } = useToast();
  const totalTasks = TASKS.length;
  const completedTasks = TASKS.filter(t => t.status === 'complete').length;
  const avgReviewTime = 2.4; // hours mock
  const approvalRate = Math.round((REVIEWS.filter(r => r.status === 'approved').length / REVIEWS.length) * 100);
  const publishSuccess = Math.round((PUBLISH_LOGS.filter(p => p.status === 'success').length / PUBLISH_LOGS.length) * 100);
  const velocity = Math.round((completedTasks / totalTasks) * 100);

  const kpis = [
    { label: 'Total Velocity', value: `${velocity}%`, change: '+5%', up: true, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Avg Review Time', value: `${avgReviewTime}h`, change: '-0.3h', up: false, icon: Clock, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Approval Rate', value: `${approvalRate}%`, change: '+2%', up: true, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Publish Success', value: `${publishSuccess}%`, change: '-1%', up: false, icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  ];

  // Generate mock chart data
  const deliveryData = [
    { week: 'W1', planned: 12, actual: 10 }, { week: 'W2', planned: 15, actual: 14 },
    { week: 'W3', planned: 18, actual: 20 }, { week: 'W4', planned: 22, actual: 19 },
    { week: 'W5', planned: 25, actual: 23 }, { week: 'W6', planned: 20, actual: 22 },
    { week: 'W7', planned: 28, actual: 26 }, { week: 'W8', planned: 30, actual: 28 },
  ];

  const maxDelivery = Math.max(...deliveryData.flatMap(d => [d.planned, d.actual]));

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">Executive production dashboard</p>
        </div>
        <div className="flex gap-2">
          <Select defaultValue="30d">
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => toast({ title: 'Export Complete', description: 'Dashboard data exported to CSV.' })}><Download className="w-4 h-4" /> Export</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium ${kpi.up ? 'text-green-500' : 'text-red-500'}`}>
                  {kpi.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {kpi.change}
                </div>
              </div>
              <div className="text-3xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Delivery Trends - CSS Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Delivery Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 h-48">
                {deliveryData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="flex gap-0.5 items-end h-40 w-full">
                      <div className="flex-1 bg-primary/20 rounded-t-sm transition-all duration-500" style={{ height: `${(d.planned / maxDelivery) * 100}%` }} />
                      <div className="flex-1 bg-primary rounded-t-sm transition-all duration-500" style={{ height: `${(d.actual / maxDelivery) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{d.week}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-primary/20" /> Planned</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-primary" /> Actual</div>
              </div>
            </CardContent>
          </Card>

          {/* Department Breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Department Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {DEPARTMENTS.slice(0, 6).map((dept, i) => {
                  const tasksDone = [85, 72, 91, 65, 78, 88][i];
                  const reviewCycles = [1.2, 2.1, 1.0, 2.8, 1.5, 1.3][i];
                  const onTime = [92, 78, 96, 60, 85, 90][i];
                  return (
                    <div key={dept.id} className="grid grid-cols-[160px_1fr_80px_80px_80px] items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
                        <span className="font-medium">{dept.name}</span>
                      </div>
                      <div className="h-4 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${tasksDone}%`, backgroundColor: dept.color }} />
                      </div>
                      <span className="text-right font-mono">{tasksDone}%</span>
                      <span className="text-right text-muted-foreground">{reviewCycles}x</span>
                      <span className={`text-right font-medium ${onTime > 85 ? 'text-green-500' : onTime > 70 ? 'text-yellow-500' : 'text-red-500'}`}>{onTime}%</span>
                    </div>
                  );
                })}
                <div className="grid grid-cols-[160px_1fr_80px_80px_80px] text-[10px] text-muted-foreground border-t border-border pt-2">
                  <span></span><span></span><span className="text-right">Completed</span><span className="text-right">Rev. Cycles</span><span className="text-right">On-Time</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Review Statistics */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Review Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-6">
                {[
                  { label: 'Avg Rounds', value: '1.6', sub: 'per shot' },
                  { label: 'First-Pass Rate', value: '42%', sub: 'approved on v001' },
                  { label: 'Avg Turnaround', value: '4.2h', sub: 'from submit to decision' },
                  { label: 'Active Reviewers', value: '12', sub: 'this week' },
                ].map((s, i) => (
                  <div key={i} className="text-center">
                    <div className="text-2xl font-bold">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Project Forecast */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Project Forecast</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {PROJECTS.slice(0, 5).map(proj => {
                const risk = proj.riskScore;
                return (
                  <div key={proj.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{proj.name}</span>
                      <Badge variant={risk > 50 ? 'destructive' : risk > 30 ? 'secondary' : 'outline'} className="text-[10px]">
                        {risk > 50 ? 'High Risk' : risk > 30 ? 'Medium' : 'Low Risk'}
                      </Badge>
                    </div>
                    <div className="relative h-5 bg-muted rounded-full overflow-hidden">
                      <div className="absolute top-0 bottom-0 left-0 bg-primary/30 rounded-full" style={{ width: `${Math.min(proj.progress + 20, 100)}%` }} />
                      <div className="absolute top-0 bottom-0 left-0 bg-primary rounded-full" style={{ width: `${proj.progress}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{proj.progress}% complete</span>
                      <span>Due {new Date(proj.dueDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Publishing Statistics */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Publishing Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Total Published', value: PUBLISH_LOGS.filter(p => p.status === 'success').length, color: 'text-green-500' },
                  { label: 'Failed', value: PUBLISH_LOGS.filter(p => p.status === 'failed').length, color: 'text-red-500' },
                  { label: 'Avg Duration', value: '3m 45s', color: 'text-blue-500' },
                  { label: 'Validation Pass Rate', value: `${publishSuccess}%`, color: publishSuccess > 90 ? 'text-green-500' : 'text-yellow-500' },
                ].map((s, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className={`font-bold ${s.color}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Contributors */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5" /> Top Contributors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {USERS.slice(0, 5).map((user, i) => (
                <div key={user.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4">#{i + 1}</span>
                  <div className="w-7 h-7 rounded-full overflow-hidden">
                    <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{user.name}</div>
                    <div className="text-[10px] text-muted-foreground">{user.role}</div>
                  </div>
                  <span className="text-sm font-bold">{[47, 42, 38, 35, 31][i]} tasks</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
