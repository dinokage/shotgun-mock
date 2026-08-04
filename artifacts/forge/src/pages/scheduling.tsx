import { SCHEDULING_CAPACITY, USERS, AI_RECOMMENDATIONS } from '@/data/mockData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Scheduling() {
  const { toast } = useToast();

  const getCellColor = (val: number) => {
    if (val < 90) return 'bg-[#1E7A34]/20 text-[#1E7A34] dark:text-[#5FD179]';
    if (val <= 110) return 'bg-[#B5651D]/20 text-[#B5651D] dark:text-[#E8A565]';
    return 'bg-[#A03030]/20 text-[#A03030] dark:text-[#E06666] font-bold ring-1 ring-inset ring-[#A03030]/50';
  };

  const getSeverityColor = (sev: string) => {
    if (sev === 'CRITICAL') return 'bg-[#A03030] text-white';
    if (sev === 'HIGH') return 'bg-[#B5651D] text-white';
    return 'bg-yellow-600 text-white';
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Scheduling & Capacity</h1>
        <Button variant="outline">Export Schedule</Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="overflow-hidden border-border">
            <CardHeader className="bg-muted/30 border-b border-border">
              <CardTitle className="text-lg">Artist Capacity (Next 5 Weeks)</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-card">
                  <tr>
                    <th className="p-3 border-b border-border w-48">Artist</th>
                    {[1, 2, 3, 4, 5].map(w => (
                      <th key={w} className="p-3 border-b border-border text-center font-medium">W{w}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCHEDULING_CAPACITY.map((cap, i) => {
                    const user = USERS.find(u => u.id === cap.userId);
                    return (
                      <tr key={cap.userId} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="p-3 flex items-center gap-2">
                          <UserAvatar userId={cap.userId} />
                          <span className="font-medium">{user?.name}</span>
                        </td>
                        {cap.weeks.map((val, j) => (
                          <td key={j} className="p-1">
                            <div 
                              className={`h-10 rounded-md flex items-center justify-center transition-colors cursor-pointer hover:opacity-80 ${getCellColor(val)}`}
                              onClick={() => toast({ title: 'Slot clicked', description: `${user?.name} is at ${val}% capacity in Week ${j+1}` })}
                            >
                              {val}%
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Probabilistic Completion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                { name: 'Starfall', p50: 30, p80: 60, p95: 85, color: 'bg-blue-500' },
                { name: 'Iron Veil', p50: 45, p80: 75, p95: 95, color: 'bg-purple-500' },
              ].map((proj, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>{proj.name}</span>
                  </div>
                  <div className="relative h-6 bg-muted rounded-full overflow-hidden">
                    <div className={`absolute top-0 bottom-0 left-0 ${proj.color} opacity-40`} style={{ width: `${proj.p95}%` }} />
                    <div className={`absolute top-0 bottom-0 left-0 ${proj.color} opacity-70`} style={{ width: `${proj.p80}%` }} />
                    <div className={`absolute top-0 bottom-0 left-0 ${proj.color}`} style={{ width: `${proj.p50}%` }} />
                    
                    <div className="absolute top-0 bottom-0 w-px bg-foreground" style={{ left: `${proj.p50}%` }}>
                      <div className="absolute -top-5 -translate-x-1/2 text-[10px] font-bold">P50</div>
                    </div>
                    <div className="absolute top-0 bottom-0 w-px bg-foreground/60" style={{ left: `${proj.p80}%` }}>
                      <div className="absolute -top-5 -translate-x-1/2 text-[10px] font-medium text-muted-foreground">P80</div>
                    </div>
                    <div className="absolute top-0 bottom-0 w-px bg-foreground/30" style={{ left: `${proj.p95}%` }}>
                      <div className="absolute -top-5 -translate-x-1/2 text-[10px] text-muted-foreground">P95</div>
                    </div>
                  </div>
                  <div className="h-6" /> {/* spacer for labels */}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
            <CardHeader className="pb-3 border-b border-border bg-primary/5">
              <CardTitle className="text-lg flex items-center gap-2 text-primary">
                <Sparkles className="w-5 h-5" /> AI Risk & Bottlenecks
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {AI_RECOMMENDATIONS.map(rec => (
                  <div key={rec.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getSeverityColor(rec.severity)}>{rec.severity}</Badge>
                      <Badge variant="outline" className="font-mono text-[10px]">{rec.entity}</Badge>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed mb-3">
                      {rec.title}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        Affected: <span className="font-medium text-foreground">{rec.assignee}</span>
                      </div>
                      <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => toast({ title: 'Action taken', description: 'Reallocation proposed.' })}>
                        Take Action <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
