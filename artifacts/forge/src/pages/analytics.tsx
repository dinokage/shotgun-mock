import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROJECTS, TASKS, REVIEWS, PUBLISH_LOGS, DEPARTMENTS, USERS, TIME_LOGS } from '@/data/mockData';
import { BarChart3, TrendingUp, Clock, CheckCircle2, AlertTriangle, Users, Download, ArrowUpRight, ArrowDownRight, Flame } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Analytics() {
  const { toast } = useToast();
  const totalTasks = TASKS.length;
  const completedTasks = TASKS.filter(t => t.status === 'approved').length;
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
          <Button variant="outline" className="gap-2" onClick={() => window.print()}><Download className="w-4 h-4" /> Export</Button>
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

      <Tabs defaultValue="production" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="production">Production Metrics</TabsTrigger>
          <TabsTrigger value="financials">Financials & Bidding</TabsTrigger>
          <TabsTrigger value="timecards">Timecards & Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="production" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Bidding vs Actuals (Burn Rate) */}
          <Card className="border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
            <CardHeader className="pb-3 bg-orange-500/5">
              <CardTitle className="text-lg flex items-center gap-2 text-orange-500"><Flame className="w-5 h-5" /> Bidding vs Actuals (Burn Rate)</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-5">
              {PROJECTS.slice(0, 3).map((proj, i) => {
                const bids = [400, 1200, 850][i];
                const actuals = [450, 1100, 920][i];
                const burnRate = Math.round((actuals / bids) * 100);
                const isOverBudget = actuals > bids;
                return (
                  <div key={proj.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{proj.name}</span>
                      <div className="flex gap-4">
                        <span className="text-muted-foreground">Bid: {bids}h</span>
                        <span className={isOverBudget ? 'text-red-500 font-bold' : 'text-green-500 font-bold'}>Actual: {actuals}h</span>
                      </div>
                    </div>
                    <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                      <div className="absolute top-0 bottom-0 left-0 bg-blue-500/40 rounded-full" style={{ width: `100%` }} />
                      <div className={`absolute top-0 bottom-0 left-0 rounded-full transition-all duration-700 ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(burnRate, 100)}%` }} />
                      {isOverBudget && <div className="absolute top-0 bottom-0 right-0 bg-red-600 animate-pulse" style={{ width: `${Math.min(burnRate - 100, 100)}%` }} />}
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Burn Rate: <span className={isOverBudget ? 'text-red-500' : 'text-foreground'}>{burnRate}%</span></span>
                      {isOverBudget ? (
                        <span className="text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Over budget by {actuals - bids}h</span>
                      ) : (
                        <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Under budget by {bids - actuals}h</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

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

          {/* Department Capacity Heatmap */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Department Capacity</CardTitle>
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-green-500/20 border border-green-500/50" /> Available</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-yellow-500/20 border border-yellow-500/50" /> Heavy</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-red-500/20 border border-red-500/50" /> Overloaded</div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-muted-foreground pb-2 w-32">Department</th>
                      {['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'].map(w => (
                        <th key={w} className="text-center font-medium text-muted-foreground pb-2 w-16">{w}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DEPARTMENTS.slice(0, 6).map((dept, i) => {
                      // Generate some fake capacity data per week (0-150%)
                      const baseLoad = [80, 95, 60, 110, 40, 85][i];
                      const weekLoads = Array.from({ length: 8 }).map((_, w) => {
                        return Math.max(0, baseLoad + Math.sin(w) * 30 + Math.random() * 20);
                      });

                      return (
                        <tr key={dept.id} className="border-t border-border group">
                          <td className="py-2">
                            <Link href={`/departments/${dept.id}`}>
                              <div className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded-md -ml-1 transition-colors">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dept.color }} />
                                <span className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                                  {dept.name} <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </span>
                              </div>
                            </Link>
                          </td>
                          {weekLoads.map((load, w) => {
                            let color = 'bg-green-500/10 text-green-600 border-green-500/30';
                            if (load > 110) color = 'bg-red-500/10 text-red-600 border-red-500/30';
                            else if (load > 85) color = 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
                            return (
                              <td key={w} className="p-1">
                                <div 
                                  className={`h-8 rounded flex items-center justify-center font-mono text-[10px] border transition-colors hover:border-primary/50 cursor-help ${color}`}
                                  title={`${dept.name} Week ${w+1}: ${Math.round(load)}% Capacity`}
                                >
                                  {Math.round(load)}%
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
        </TabsContent>

        <TabsContent value="financials" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2"><Flame className="text-orange-500" /> Studio Burn Rate & Margins</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-muted-foreground">
                        <th className="pb-3 font-medium">Project</th>
                        <th className="pb-3 font-medium text-right">Estimated Bid (hrs)</th>
                        <th className="pb-3 font-medium text-right">Actual Burn (hrs)</th>
                        <th className="pb-3 font-medium text-right">Avg Rate ($)</th>
                        <th className="pb-3 font-medium text-right">Bid Value ($)</th>
                        <th className="pb-3 font-medium text-right">Actual Cost ($)</th>
                        <th className="pb-3 font-medium text-right">Profit Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {PROJECTS.map((proj, i) => {
                        const bids = [400, 1200, 850, 200, 150][i] || 300;
                        const actuals = [450, 1100, 920, 180, 50][i] || 250;
                        const rate = 85; // Avg hourly rate
                        const bidValue = bids * rate;
                        const actualCost = actuals * rate;
                        const profit = bidValue - actualCost;
                        const margin = Math.round((profit / bidValue) * 100);
                        const isLoss = margin < 0;

                        return (
                          <tr key={proj.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-4 font-medium">{proj.name}</td>
                            <td className="py-4 text-right tabular-nums">{bids}h</td>
                            <td className="py-4 text-right tabular-nums text-muted-foreground">{actuals}h</td>
                            <td className="py-4 text-right tabular-nums">${rate}/h</td>
                            <td className="py-4 text-right tabular-nums">${bidValue.toLocaleString()}</td>
                            <td className="py-4 text-right tabular-nums">${actualCost.toLocaleString()}</td>
                            <td className="py-4 text-right">
                              <Badge variant="outline" className={isLoss ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}>
                                {isLoss ? '' : '+'}{margin}%
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="timecards" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2"><Clock className="text-blue-500 w-5 h-5" /> Artist Timecards</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="pb-3 font-medium">Artist</th>
                      <th className="pb-3 font-medium">Department</th>
                      <th className="pb-3 font-medium text-center">Status</th>
                      <th className="pb-3 font-medium text-right">Today (hrs)</th>
                      <th className="pb-3 font-medium text-right">This Week (hrs)</th>
                      <th className="pb-3 font-medium text-right">Utilization</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {USERS.map((user, i) => {
                      // Filter all logs for the user to compute actual hours, or mock it if missing
                      const userLogs = TIME_LOGS.filter(l => l.userId === user.id);
                      const actualHours = userLogs.reduce((acc, l) => acc + l.hours, 0);
                      
                      // Mock additional status since our TimeLog interface is very simple
                      const mockStatus = i % 3 === 0 ? 'punched-in' : 'offline';
                      const punchedInAt = mockStatus === 'punched-in' ? new Date().toISOString() : undefined;
                      const totalHoursToday = actualHours > 0 ? actualHours : (i % 2 === 0 ? 6.5 : 0);
                      const totalHoursWeek = actualHours > 0 ? actualHours * 5 : (i % 2 === 0 ? 32.5 : 0);
                      
                      const todayHrs = totalHoursToday.toFixed(1);
                      const weekHrs = totalHoursWeek.toFixed(1);
                      const util = Math.round((Number(weekHrs) / 40) * 100);
                      const isOver = util > 100;
                      
                      return (
                        <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-4 font-medium flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <div>{user.name}</div>
                              <div className="text-[10px] text-muted-foreground">{user.role}</div>
                            </div>
                          </td>
                          <td className="py-4">
                            <Badge variant="secondary" className="text-[10px]">{user.departmentId}</Badge>
                          </td>
                          <td className="py-4 text-center">
                            <Badge variant="outline" className={mockStatus === 'punched-in' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-muted text-muted-foreground'}>
                              {mockStatus === 'punched-in' ? `PUNCHED IN${punchedInAt ? ` (${new Date(punchedInAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})` : ''}` : 'OFFLINE'}
                            </Badge>
                          </td>
                          <td className="py-4 text-right tabular-nums font-medium">{todayHrs}h</td>
                          <td className="py-4 text-right tabular-nums">{weekHrs}h</td>
                          <td className="py-4 text-right">
                            <Badge variant="outline" className={isOver ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}>
                              {util}%
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
