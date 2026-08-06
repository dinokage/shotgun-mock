import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS, TASKS, DEPARTMENTS } from '@/data/mockData';
import { useAuthStore } from '@/store/auth';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AlertCircle, CheckCircle2, Clock, MessageSquare, Plus, ChevronRight, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DailyStandup() {
  const { currentUser } = useAuthStore();
  const [selectedDeptId, setSelectedDeptId] = useState(currentUser?.departmentId || DEPARTMENTS[0].id);
  
  const dept = DEPARTMENTS.find(d => d.id === selectedDeptId);
  const team = USERS.filter(u => u.departmentId === selectedDeptId);
  
  if (!currentUser) return null;
  const isLeadership = ['vfx_producer', 'production_manager', 'supervisor', 'lead'].includes(currentUser.role);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MonitorPlay className="w-8 h-8 text-primary" />
            Daily Standup
          </h1>
          <p className="text-muted-foreground mt-1">Review team progress, blockers, and capacity</p>
        </div>
        
        {/* Department Switcher (for Production Management only) */}
        {(currentUser.role === 'vfx_producer' || currentUser.role === 'production_manager') && (
          <select 
            className="h-10 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
          >
            {DEPARTMENTS.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left Column: Team Status Overview */}
        <div className="xl:col-span-1 space-y-4">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Team Roster</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {team.map(member => {
                const isOverloaded = member.capacity > 95;
                const isAway = member.status !== 'active';
                
                return (
                  <div key={member.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium">{member.name}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          {isAway ? (
                            <span className="text-red-500">Away/Leave</span>
                          ) : (
                            <>
                              <div className={`w-1.5 h-1.5 rounded-full ${isOverloaded ? 'bg-red-500' : 'bg-green-500'}`} />
                              Cap: {member.capacity}%
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOverloaded && <AlertCircle className="w-4 h-4 text-red-500" />}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right Columns: Active Tasks & Blockers */}
        <div className="xl:col-span-3 space-y-6">
          {/* Blocked or At Risk */}
          <div>
             <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
               <AlertCircle className="w-5 h-5 text-red-500" />
               Blocked / Needs Attention
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {TASKS.filter(t => t.department === dept?.name && (t.status === 'blocked' || t.weeklyRating === 'at-risk' || t.weeklyRating === 'behind')).slice(0, 4).map(task => {
                 const assignee = USERS.find(u => u.id === task.assigneeId);
                 return (
                   <Card key={task.id} className="border-red-500/20 bg-red-500/5">
                     <CardContent className="p-4">
                       <div className="flex justify-between items-start mb-2">
                         <div className="flex gap-2">
                            <StatusBadge status={task.status} />
                            {task.weeklyRating && <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/10 text-[10px] uppercase">Rating: {task.weeklyRating}</Badge>}
                         </div>
                       </div>
                       <div className="font-semibold text-sm mb-3">{task.title}</div>
                       <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/50">
                         <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={assignee?.avatar} />
                            </Avatar>
                            <span className="text-xs text-muted-foreground">{assignee?.name}</span>
                         </div>
                         <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/20 hover:bg-red-500/10 hover:text-red-500">Unblock</Button>
                       </div>
                     </CardContent>
                   </Card>
                 )
               })}
             </div>
          </div>

          {/* Yesterday's Progress / Daily Logs */}
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
               <CheckCircle2 className="w-5 h-5 text-green-500" />
               Recent Progress & Daily Logs
            </h3>
            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {TASKS.filter(t => t.department === dept?.name && t.dailyLogs.length > 0).slice(0, 8).map(task => {
                    const assignee = USERS.find(u => u.id === task.assigneeId);
                    const latestLog = task.dailyLogs[task.dailyLogs.length - 1];
                    return (
                      <div key={task.id} className="p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start gap-4">
                          <Avatar className="w-8 h-8 mt-1">
                            <AvatarImage src={assignee?.avatar} />
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-medium text-sm">
                                <span className="text-muted-foreground mr-1">{assignee?.name} logged</span>
                                {latestLog.hours}h on {task.title}
                              </div>
                              <span className="text-xs text-muted-foreground">{new Date(latestLog.date).toLocaleDateString()}</span>
                            </div>
                            <div className="text-sm bg-muted/50 p-2.5 rounded-md text-muted-foreground italic border-l-2 border-primary">
                              "{latestLog.note}"
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-[10px] font-normal">{task.status}</Badge>
                              <span className="text-xs text-muted-foreground">Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
