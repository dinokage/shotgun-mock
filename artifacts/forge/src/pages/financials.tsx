import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PROJECTS, DEPARTMENTS } from '@/data/mockData';
import { useTasksStore } from '@/store/tasks';
import { DollarSign, TrendingUp, TrendingDown, Users, Briefcase } from 'lucide-react';
import { useMemo } from 'react';

export default function FinancialDashboard() {
  const totalBudget = useMemo(() => PROJECTS.reduce((acc, p) => acc + (p.budget || 0), 0), []);
  const totalSpent = useMemo(() => PROJECTS.reduce((acc, p) => acc + (p.budget || 0) * 0.65, 0), []); // Mock spent

  const tasks = useTasksStore(state => state.tasks);
  
  // Generate consistent pseudo-random numbers based on strings
  const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    return Math.abs(hash);
  };

  return (
    <div className="p-8 h-[calc(100vh-3.5rem)] overflow-auto bg-[#0a0a0a] text-foreground">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white">Financial Overview</h1>
        <p className="text-muted-foreground mt-2">Real-time studio budget and cost tracking.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="bg-[#111] border-[#333]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#ccc]">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">${(totalBudget / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center">
              <TrendingUp className="w-3 h-3 text-emerald-500 mr-1" /> +2.5% from last quarter
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#111] border-[#333]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#ccc]">Total Spent</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">${(totalSpent / 1000000).toFixed(1)}M</div>
            <div className="w-full bg-[#222] h-1.5 mt-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full" style={{ width: `${(totalSpent / totalBudget) * 100}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111] border-[#333]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#ccc]">Active Projects</CardTitle>
            <Briefcase className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{PROJECTS.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Across 3 studios</p>
          </CardContent>
        </Card>
        <Card className="bg-[#111] border-[#333]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#ccc]">Burn Rate</CardTitle>
            <Users className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">$450k/mo</div>
            <p className="text-xs text-muted-foreground mt-1">Projected run rate</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-[#111] border-[#333]">
          <CardHeader>
            <CardTitle className="text-white">Budget by Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {PROJECTS.map(p => {
                const spent = (p.budget || 0) * (Math.random() * 0.4 + 0.4);
                const percent = (spent / (p.budget || 1)) * 100;
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-white">{p.name}</span>
                      <span className="text-muted-foreground">${(spent / 1000000).toFixed(1)}M / ${(p.budget! / 1000000).toFixed(1)}M</span>
                    </div>
                    <div className="w-full bg-[#222] h-2 rounded-full overflow-hidden">
                      <div className={`h-full ${percent > 90 ? 'bg-red-500' : percent > 75 ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-[#111] border-[#333]">
          <CardHeader>
            <CardTitle className="text-white">Department Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {DEPARTMENTS.slice(0, 6).map(d => {
                const percent = Math.random() * 100;
                return (
                  <div key={d.id} className="flex items-center gap-4">
                    <div className="w-24 text-sm font-medium text-[#ccc] truncate">{d.name}</div>
                    <div className="flex-1 bg-[#222] h-4 rounded overflow-hidden">
                      <div className="bg-blue-500/80 h-full" style={{ width: `${percent}%` }} />
                    </div>
                    <div className="w-16 text-right text-xs text-muted-foreground font-mono">{percent.toFixed(0)}%</div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card className="bg-[#111] border-[#333]">
          <CardHeader>
            <CardTitle className="text-white">Bidding vs Actual (Task-wise)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-[#333] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#1a1a1a]">
                  <tr className="border-b border-[#333] text-[#888]">
                    <th className="h-10 px-4 text-left font-medium w-[40%]">Task</th>
                    <th className="h-10 px-4 text-left font-medium">Department</th>
                    <th className="h-10 px-4 text-left font-medium">Status</th>
                    <th className="h-10 px-4 text-right font-medium">Bid (Days)</th>
                    <th className="h-10 px-4 text-right font-medium">Actual (Days)</th>
                    <th className="h-10 px-4 text-right font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222]">
                  {tasks.slice(0, 10).map(task => {
                    // Generate consistent mock bid/actual data
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
                      <tr key={task.id} className="hover:bg-[#1a1a1a] transition-colors">
                        <td className="p-4">
                          <div className="font-medium text-white">{task.title}</div>
                        </td>
                        <td className="p-4 text-[#aaa]">{task.department}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-[10px] uppercase font-semibold ${
                            task.status === 'complete' ? 'bg-emerald-500/10 text-emerald-500' :
                            task.status === 'in-progress' ? 'bg-amber-500/10 text-amber-500' :
                            task.status === 'bottleneck' ? 'bg-red-500/10 text-red-500' :
                            'bg-[#333] text-[#888]'
                          }`}>
                            {task.status.replace('-', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right text-[#aaa]">{bidDays}d</td>
                        <td className="p-4 text-right text-white font-medium">{actualDays > 0 ? `${actualDays}d` : '-'}</td>
                        <td className={`p-4 text-right font-medium ${isOverBudget ? 'text-red-500' : variance > 0 ? 'text-emerald-500' : 'text-[#888]'}`}>
                          {actualDays === 0 ? '-' : (variance > 0 ? `+${variance}d` : `${variance}d`)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
