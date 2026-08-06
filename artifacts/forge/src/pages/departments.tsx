import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DEPARTMENTS, USERS, TASKS } from '@/data/mockData';
import { Users, ListTodo, CheckCircle2, ArrowRight, TrendingUp } from 'lucide-react';

export default function Departments() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground mt-1">14 departments · VFX production pipeline</p>
        </div>
      </div>

      {/* Pipeline Flow Visualization */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pipeline Flow</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin">
            {DEPARTMENTS.filter(d => d.pipelineOrder > 0).sort((a, b) => a.pipelineOrder - b.pipelineOrder).map((dept, i, arr) => (
              <div key={dept.id} className="flex items-center gap-1 shrink-0">
                <Link href={`/departments/${dept.id}`}>
                  <div
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer hover:scale-105 transition-transform text-white"
                    style={{ backgroundColor: dept.color }}
                  >
                    {dept.abbreviation}
                  </div>
                </Link>
                {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Department Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {DEPARTMENTS.map(dept => {
          const members = USERS.filter(u => u.departmentId === dept.id);
          const supervisor = USERS.find(u => u.id === dept.supervisorId);
          const lead = USERS.find(u => u.id === dept.leadId);
          const deptTasks = TASKS.filter(t => t.department === dept.name);
          const completedTasks = deptTasks.filter(t => t.status === 'complete').length;
          const activeTasks = deptTasks.filter(t => t.status === 'in-progress').length;
          const completionRate = deptTasks.length > 0 ? Math.round((completedTasks / deptTasks.length) * 100) : 0;

          return (
            <Link key={dept.id} href={`/departments/${dept.id}`}>
              <Card className="cursor-pointer hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/5 group h-full">
                <CardContent className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-lg"
                        style={{ backgroundColor: dept.color }}
                      >
                        {dept.abbreviation}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">{dept.name}</h3>
                        <p className="text-[11px] text-muted-foreground">{dept.description}</p>
                      </div>
                    </div>
                    {dept.pipelineOrder > 0 && (
                      <Badge variant="outline" className="text-[10px] shrink-0">#{dept.pipelineOrder}</Badge>
                    )}
                  </div>

                  {/* Supervisor + Lead */}
                  <div className="flex items-center gap-3 mb-4 p-2.5 bg-muted/30 rounded-lg">
                    {supervisor && (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Avatar className="w-7 h-7 border-2" style={{ borderColor: dept.color }}>
                          <AvatarImage src={supervisor.avatar} />
                          <AvatarFallback className="text-[10px]">{supervisor.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{supervisor.name}</div>
                          <div className="text-[10px] text-muted-foreground">Supervisor</div>
                        </div>
                      </div>
                    )}
                    {lead && lead.id !== supervisor?.id && (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Avatar className="w-7 h-7 border-2" style={{ borderColor: dept.color + '80' }}>
                          <AvatarImage src={lead.avatar} />
                          <AvatarFallback className="text-[10px]">{lead.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{lead.name}</div>
                          <div className="text-[10px] text-muted-foreground">Lead</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold">{members.length}</span>
                      <span className="text-[10px] text-muted-foreground">team</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ListTodo className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold">{activeTasks}</span>
                      <span className="text-[10px] text-muted-foreground">active</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold">{completedTasks}</span>
                      <span className="text-[10px] text-muted-foreground">done</span>
                    </div>
                  </div>

                  {/* Completion Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Completion rate</span>
                      <span className="font-semibold" style={{ color: dept.color }}>{completionRate}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${completionRate}%`, backgroundColor: dept.color }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
