import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { stagger } from '@/lib/motion';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS, TASKS, isTaskActive, isTaskDone } from '@/data/mockData';
import { Users, ListTodo, CheckCircle2, ArrowRight, Settings, Check, ChevronLeft, ChevronRight, Workflow } from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { useDepartmentPipelineStore } from '@/store/departments';
import { useCapability } from '@/hooks/use-capability';
import { useDepartments } from '@/hooks/useDepartments';

export default function Departments() {
  const prefersReducedMotion = useReducedMotion();
  const { currentUser } = useAuthStore();
  const isGlobalManager = currentUser && ['vfx_producer', 'production_manager', 'admin'].includes(currentUser.role);
  const canManagePipeline = useCapability('manage_pipeline');

  const { data: DEPARTMENTS = [], isLoading } = useDepartments();

  const [isEditing, setIsEditing] = useState(false);
  const pipelineOrder = useDepartmentPipelineStore((s) => s.pipelineOrder);
  const moveInPipeline = useDepartmentPipelineStore((s) => s.moveInPipeline);

  if (isLoading) return <div className="p-6">Loading departments...</div>;

  // Resolve the persisted id order back to department records, scoped to what
  // this user is allowed to see, same as before.
  const pipelineDepts = pipelineOrder
    .map((id) => DEPARTMENTS.find((d) => d.id === id))
    .filter((d): d is (typeof DEPARTMENTS)[number] => !!d)
    .filter((d) => isGlobalManager || d.id === currentUser?.departmentId);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground mt-1">{DEPARTMENTS.length} departments · VFX production pipeline</p>
        </div>
      </div>

      {/* Pipeline Flow Visualization */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pipeline Flow</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link href="/workflows/new">
                  <Workflow className="w-3.5 h-3.5 mr-1.5" /> Advanced Builder
                </Link>
              </Button>
              {canManagePipeline && (
                <Button
                  variant={isEditing ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Settings className="w-3.5 h-3.5 mr-1.5" />}
                  {isEditing ? 'Done Editing' : 'Customize Here'}
                </Button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin">
            {pipelineDepts.map((dept, i, arr) => (
              <div key={dept.id} className="flex items-center gap-1 shrink-0">
                <div className="relative group">
                  <Link href={`/departments/${dept.id}`}>
                    <div
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer transition-transform text-white hover:scale-105 ${isEditing ? 'pr-8' : ''}`}
                      style={{ backgroundColor: dept.color }}
                    >
                      {dept.abbreviation}
                    </div>
                  </Link>
                  
                  {isEditing && canManagePipeline && (
                    <div className="absolute right-0.5 top-0.5 flex flex-col gap-0.5">
                      <button
                        onClick={(e) => { e.preventDefault(); moveInPipeline(dept.id, 'right'); }}
                        disabled={i === arr.length - 1}
                        className="bg-black/30 hover:bg-black/50 text-white rounded p-0.5 disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight className="w-2.5 h-2.5" />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); moveInPipeline(dept.id, 'left'); }}
                        disabled={i === 0}
                        className="bg-black/30 hover:bg-black/50 text-white rounded p-0.5 disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
                {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Department Grid By Pipeline */}
      <div className="space-y-8">
        {(['PROD', '3D', 'VFX', '2D'] as const).map(pipelineType => {
          const pipelineLabel = {
            'PROD': 'Production Management',
            '3D': '3D Pipeline',
            'VFX': 'VFX Pipeline',
            '2D': '2D Pipeline'
          }[pipelineType];

          const depts = DEPARTMENTS.filter(d => d.pipeline === pipelineType && (isGlobalManager || d.id === currentUser?.departmentId));
          if (depts.length === 0) return null;

          return (
            <div key={pipelineType} className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight border-b border-border/50 pb-2 flex items-center gap-2">
                <div className="w-2 h-5 bg-primary rounded-sm" />
                {pipelineLabel}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {depts.map((dept, i) => {
                  const members = USERS.filter(u => u.departmentId === dept.id);
                  const supervisor = USERS.find(u => u.id === dept.supervisorId);
                  const lead = USERS.find(u => u.id === dept.leadId);
                  const deptTasks = TASKS.filter(t => t.department === dept.name);
                  // Use the shared isTaskDone/isTaskActive classification so this "active"/"done"
                  // count matches the Department Detail and Tracking Grid pages for the same dept.
                  const completedTasks = deptTasks.filter(t => isTaskDone(t.status)).length;
                  const activeTasks = deptTasks.filter(t => isTaskActive(t.status)).length;
                  const completionRate = deptTasks.length > 0 ? Math.round((completedTasks / deptTasks.length) * 100) : 0;

                  return (
                    <motion.div key={dept.id} {...(prefersReducedMotion ? {} : stagger(i))}>
                    <Link href={`/departments/${dept.id}`}>
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
                              <span className="font-semibold">{completionRate}%</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="h-1.5 rounded-full" 
                                style={{ width: `${completionRate}%`, backgroundColor: dept.color }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
