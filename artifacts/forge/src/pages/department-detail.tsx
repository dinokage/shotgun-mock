import { useParams, Link } from 'wouter';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DEPARTMENTS, USERS, TASKS, ROLE_LABELS, isTaskActive, isTaskDone } from '@/data/mockData';
import { Users, ListTodo, TrendingUp, ArrowLeft, MoreHorizontal, Settings2, ShieldCheck, User } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PriorityChip } from '@/components/shared/PriorityChip';
import { useAuthStore } from '@/store/auth';

export default function DepartmentDetail() {
  const { id } = useParams<{ id: string }>();
  const dept = DEPARTMENTS.find(d => d.id === id);
  const { currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');

  if (!dept) {
    return <div className="p-6 text-center text-muted-foreground">Department not found</div>;
  }

  const isGlobalManager = currentUser && ['vfx_producer', 'production_manager'].includes(currentUser.role);
  if (!isGlobalManager && currentUser?.departmentId !== dept.id) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto text-center mt-20">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">You do not have permission to view other department's details.</p>
        <Link href="/departments" className="text-primary hover:underline">Return to your department</Link>
      </div>
    );
  }

  const team = USERS.filter(u => u.departmentId === dept.id).sort((a, b) => {
    // Sort by role hierarchy
    const roleWeight = {
      supervisor: 5,
      lead: 4,
      senior_artist: 3,
      artist: 2,
      junior_artist: 1
    } as Record<string, number>;
    return (roleWeight[b.role] || 0) - (roleWeight[a.role] || 0);
  });

  const supervisor = team.find(u => u.id === dept.supervisorId);
  const lead = team.find(u => u.id === dept.leadId);
  
  const deptTasks = TASKS.filter(t => t.department === dept.name);
  // Use the shared isTaskDone/isTaskActive classification (same as the Departments overview
  // and Tracking Grid pages) so a department's active/done counts agree everywhere it's shown.
  const activeTasks = deptTasks.filter(t => isTaskActive(t.status));
  const completedTasks = deptTasks.filter(t => isTaskDone(t.status));
  
  const isSupervisorOrLead = currentUser?.role === 'supervisor' || currentUser?.role === 'lead' || currentUser?.role === 'production_manager' || currentUser?.role === 'vfx_producer';

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link href="/departments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to Departments
        </Link>
        
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg"
              style={{ backgroundColor: dept.color }}
            >
              {dept.abbreviation}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{dept.name}</h1>
              <p className="text-muted-foreground mt-1">{dept.description}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {isSupervisorOrLead && (
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors">
                Assign Tasks
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team ({team.length})</TabsTrigger>
          <TabsTrigger value="tasks">Active Tasks ({activeTasks.length})</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          {isSupervisorOrLead && (
             <TabsTrigger value="settings">Settings</TabsTrigger>
          )}
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 animate-in fade-in">
          {/* Top Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{team.length}</div>
                  <div className="text-xs text-muted-foreground">Team Members</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <ListTodo className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{activeTasks.length}</div>
                  <div className="text-xs text-muted-foreground">Active Tasks</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{deptTasks.length > 0 ? Math.round((completedTasks.length / deptTasks.length) * 100) : 0}%</div>
                  <div className="text-xs text-muted-foreground">Completion Rate</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">1.2d</div>
                  <div className="text-xs text-muted-foreground">Avg Review Cycle</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Leadership */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Leadership</h3>
              
              {supervisor && (
                <Card className="border-border/50">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Avatar className="w-12 h-12 border-2" style={{ borderColor: dept.color }}>
                      <AvatarImage src={supervisor.avatar} />
                      <AvatarFallback>{supervisor.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">{supervisor.name}</div>
                      <div className="text-xs text-muted-foreground">{supervisor.title}</div>
                      <Badge variant="secondary" className="mt-2 text-[10px] bg-primary/10 text-primary hover:bg-primary/20">
                        Supervisor
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {lead && lead.id !== supervisor?.id && (
                <Card className="border-border/50">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Avatar className="w-12 h-12 border-2" style={{ borderColor: dept.color + '80' }}>
                      <AvatarImage src={lead.avatar} />
                      <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">{lead.title}</div>
                      <Badge variant="secondary" className="mt-2 text-[10px]">
                        Lead
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Team Skills Overview */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Department Skills Matrix</h3>
              <Card className="border-border/50">
                <CardContent className="p-6">
                  {/* Just a visualization mock of skills distribution */}
                  <div className="space-y-4">
                    {Array.from(new Set(team.flatMap(u => u.skills))).slice(0, 5).map(skill => {
                      const usersWithSkill = team.filter(u => u.skills.includes(skill)).length;
                      const percentage = Math.round((usersWithSkill / team.length) * 100);
                      return (
                        <div key={skill} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">{skill}</span>
                            <span className="text-muted-foreground">{usersWithSkill} {usersWithSkill === 1 ? 'artist' : 'artists'} ({percentage}%)</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all" 
                              style={{ width: `${percentage}%`, backgroundColor: dept.color }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TEAM TAB */}
        <TabsContent value="team" className="space-y-4 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {team.map(member => (
              <Card key={member.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <Badge variant={member.status === 'active' ? 'default' : 'secondary'} className={member.status === 'active' ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20 shadow-none' : ''}>
                      {member.status}
                    </Badge>
                  </div>
                  <div className="font-semibold">{member.name}</div>
                  <div className="text-xs text-muted-foreground mb-3">{ROLE_LABELS[member.role] || member.title}</div>
                  
                  <div className="flex flex-wrap gap-1 mb-4">
                    {member.skills.slice(0, 2).map(s => (
                      <span key={s} className="px-1.5 py-0.5 bg-muted rounded text-[9px] text-muted-foreground">
                        {s}
                      </span>
                    ))}
                    {member.skills.length > 2 && (
                      <span className="px-1.5 py-0.5 bg-muted rounded text-[9px] text-muted-foreground">
                        +{member.skills.length - 2}
                      </span>
                    )}
                  </div>
                  
                  <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                    <div className="text-muted-foreground">Capacity</div>
                    <div className="font-semibold flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${member.capacity > 90 ? 'bg-red-500' : member.capacity > 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${member.capacity}%` }}
                        />
                      </div>
                      {member.capacity}%
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TASKS TAB (Simplified view for dept page) */}
        <TabsContent value="tasks" className="space-y-4 animate-in fade-in">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {activeTasks.slice(0, 15).map(task => {
                  const assignee = USERS.find(u => u.id === task.assigneeId);
                  return (
                    <div key={task.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <StatusBadge status={task.status} />
                        <div>
                          <div className="font-medium text-sm">{task.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Due {new Date(task.dueDate).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <PriorityChip priority={task.priority} />
                        {assignee && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{assignee.name}</span>
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={assignee.avatar} />
                            </Avatar>
                          </div>
                        )}
                        <button className="p-1.5 hover:bg-muted rounded-md text-muted-foreground">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* OTHER TABS */}
        <TabsContent value="performance" className="h-64 flex items-center justify-center border border-dashed border-border rounded-lg text-muted-foreground bg-muted/10">
          Performance metrics visualization (Burndown, Velocity, Quality)
        </TabsContent>
        
        <TabsContent value="settings" className="h-64 flex items-center justify-center border border-dashed border-border rounded-lg text-muted-foreground bg-muted/10">
          Department configuration, workflows, and automated pipeline rules
        </TabsContent>

      </Tabs>
    </div>
  );
}
