import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SHOTS, DEPARTMENTS, PROJECTS, TASKS, USERS } from '@/data/mockData';
import { TableProperties, PlayCircle, MoreVertical, CheckCircle2, Clock, AlertTriangle, Users, BarChart3, Filter } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useUIStore } from '@/store/ui';
import { Link, useLocation } from 'wouter';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function ProductionDashboard() {
  const { currentUser } = useAuthStore();
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<'all' | 'review' | 'at-risk'>('all');

  const isManager = currentUser && ['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role);

  const globalStats = useMemo(() => {
    return {
      total: SHOTS.length,
      review: SHOTS.filter(s => s.status === 'review' || s.status === 'client-review' || s.clientReviewStatus === 'pending').length,
      atRisk: SHOTS.filter(s => s.status === 'at-risk' || s.status === 'bottleneck').length,
      complete: SHOTS.filter(s => s.status === 'complete').length,
    };
  }, []);

  const filteredShots = useMemo(() => {
    if (filter === 'all') return SHOTS;
    if (filter === 'review') return SHOTS.filter(s => s.status === 'review' || s.status === 'client-review' || s.clientReviewStatus === 'pending');
    if (filter === 'at-risk') return SHOTS.filter(s => s.status === 'at-risk' || s.status === 'bottleneck');
    return SHOTS;
  }, [filter]);

  if (!isManager) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-muted-foreground">
        <TableProperties className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-semibold mb-2 text-foreground">Access Denied</h2>
        <p>You need Production or Supervisor privileges to access the Production Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8 animate-in fade-in">
      {/* Header & Global Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Production Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time studio health, department deliverables, and risk assessment.</p>
        </div>
        <div className="flex gap-2">
           <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>All Shots</Button>
           <Button variant={filter === 'review' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('review')} className="gap-2">
             <Clock className="w-4 h-4" /> Needs Review ({globalStats.review})
           </Button>
           <Button variant={filter === 'at-risk' ? 'destructive' : 'outline'} size="sm" onClick={() => setFilter('at-risk')} className="gap-2">
             <AlertTriangle className="w-4 h-4" /> At Risk ({globalStats.atRisk})
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-muted/30 border-border">
          <CardHeader className="p-4 pb-2"><CardDescription className="font-medium text-foreground">Total Shots</CardDescription></CardHeader>
          <CardContent className="p-4 pt-0 flex items-center justify-between">
            <span className="text-3xl font-bold">{globalStats.total}</span>
            <BarChart3 className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardHeader className="p-4 pb-2"><CardDescription className="font-medium text-blue-500">Pending Review</CardDescription></CardHeader>
          <CardContent className="p-4 pt-0 flex items-center justify-between">
            <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">{globalStats.review}</span>
            <Clock className="w-8 h-8 text-blue-500/30" />
          </CardContent>
        </Card>
        <Card className="bg-red-500/10 border-red-500/20">
          <CardHeader className="p-4 pb-2"><CardDescription className="font-medium text-red-500">At Risk</CardDescription></CardHeader>
          <CardContent className="p-4 pt-0 flex items-center justify-between">
            <span className="text-3xl font-bold text-red-600 dark:text-red-400">{globalStats.atRisk}</span>
            <AlertTriangle className="w-8 h-8 text-red-500/30" />
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/20">
          <CardHeader className="p-4 pb-2"><CardDescription className="font-medium text-green-500">Completed</CardDescription></CardHeader>
          <CardContent className="p-4 pt-0 flex items-center justify-between">
            <span className="text-3xl font-bold text-green-600 dark:text-green-400">{globalStats.complete}</span>
            <CheckCircle2 className="w-8 h-8 text-green-500/30" />
          </CardContent>
        </Card>
      </div>

      {/* Department Wise Previews */}
      <div className="space-y-8">
        {['Layout', 'Animation', 'Lighting', 'FX', 'Rendering', 'Compositing'].map((deptName, i) => {
          const dept = DEPARTMENTS.find(d => d.name.toLowerCase().includes(deptName.toLowerCase())) || { id: deptName, name: deptName, color: 'hsl(var(--primary))' };
          
          // Deterministic mock generation based on index, but filtered
          const deptShots = [...filteredShots].sort((a, b) => a.id.localeCompare(b.id)).slice(i * 4, (i * 4) + 4);
          
          if (deptShots.length === 0) return null; // Don't show empty departments when filtering

          const deptProgress = Math.floor(Math.random() * 40) + 40; // Mock progress

          return (
            <Card key={dept.id} className="border-border shadow-sm overflow-hidden">
              <div className="h-1 w-full bg-muted">
                <div className="h-full transition-all duration-1000" style={{ width: `${deptProgress}%`, backgroundColor: dept.color }} />
              </div>
              <CardHeader className="flex flex-row items-center justify-between pb-4 bg-muted/10">
                <div className="flex items-center gap-4">
                  <CardTitle className="text-xl font-semibold flex items-center gap-2" style={{ color: dept.color }}>
                    {dept.name}
                  </CardTitle>
                  <Badge variant="secondary" className="font-mono text-xs">{deptProgress}% Complete</Badge>
                </div>
                <Link href="/tracking" className="text-sm text-primary hover:underline font-medium">View Pipeline</Link>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {deptShots.map(shot => {
                    const project = PROJECTS.find(p => p.id === shot.projectId);
                    const shotTasks = TASKS.filter(t => t.shotId === shot.id);
                    
                    return (
                      <div key={shot.id} className="group relative flex flex-col gap-3">
                        <HoverCard openDelay={200}>
                          <HoverCardTrigger asChild>
                            <div className="cursor-pointer" onClick={() => setLocation('/review')}>
                              <div className="relative aspect-video bg-card rounded-lg overflow-hidden border border-border group-hover:border-primary/50 group-hover:shadow-md transition-all">
                                {shot.thumbnail ? (
                                  <img src={shot.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={shot.name} />
                                ) : (
                                  <div className="w-full h-full bg-muted/30 flex items-center justify-center">
                                    <PlayCircle className="w-8 h-8 text-muted-foreground/30" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <PlayCircle className="w-12 h-12 text-white drop-shadow-md" />
                                </div>
                                <div className="absolute top-2 left-2 flex gap-1">
                                  {shot.clientReviewStatus === 'pending' && <Badge variant="destructive" className="shadow-md text-[10px] uppercase">Client Review</Badge>}
                                </div>
                                <div className="absolute bottom-2 right-2">
                                  <StatusBadge status={shot.status} className="shadow-md bg-background/90 backdrop-blur" />
                                </div>
                              </div>
                            </div>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80 p-0 overflow-hidden" side="right" align="start">
                            <div className="p-4 bg-muted/50 border-b border-border">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-bold text-base">{shot.name}</h4>
                                  <p className="text-xs text-muted-foreground">{project?.name}</p>
                                </div>
                                <Badge variant="outline" className="font-mono text-[10px]">{shot.frameRange || '1001-1150'}</Badge>
                              </div>
                            </div>
                            <div className="p-4 space-y-3">
                              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Active Tasks</div>
                              {shotTasks.slice(0, 3).map(task => {
                                const assignee = USERS.find(u => u.id === task.assigneeId);
                                return (
                                  <div key={task.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Avatar className="w-6 h-6"><AvatarImage src={assignee?.avatar}/><AvatarFallback>{assignee?.name.charAt(0)}</AvatarFallback></Avatar>
                                      <span className="text-sm">{task.department}</span>
                                    </div>
                                    <StatusBadge status={task.status} className="scale-90 origin-right" />
                                  </div>
                                );
                              })}
                              {shotTasks.length === 0 && <p className="text-sm text-muted-foreground">No active tasks</p>}
                            </div>
                          </HoverCardContent>
                        </HoverCard>

                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-sm group-hover:text-primary transition-colors flex items-center gap-2">
                              {shot.name}
                              {shot.complexity === 'high' && <Badge variant="secondary" className="text-[9px] h-4 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20">High Cmplx</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{project?.name} • {shot.usdVersion || 'v001.usd'}</div>
                          </div>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setLocation('/review')}>Review in Player</DropdownMenuItem>
                              <DropdownMenuItem>View in Pipeline</DropdownMenuItem>
                              <DropdownMenuItem>Assign Artists</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-orange-500">Flag as Bottleneck</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredShots.length === 0 && (
          <div className="py-20 text-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
            <Filter className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-foreground">No shots found</h3>
            <p className="text-sm">No departments have shots matching your current filters.</p>
            <Button variant="outline" className="mt-4" onClick={() => setFilter('all')}>Clear Filters</Button>
          </div>
        )}
      </div>
    </div>
  );
}
