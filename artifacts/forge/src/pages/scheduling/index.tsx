import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Cpu, Download, Users, CalendarRange, LineChart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DEPARTMENTS, PROJECTS, USERS, Task } from '@/data/mockData';
import { useTasksStore } from '@/store/tasks';
import { addDays } from './utils';
import TeamBoard from './TeamBoard';
import TeamCalendar from './TeamCalendar';
import CapacityForecast from './CapacityForecast';

type SchedulingView = 'board' | 'calendar' | 'forecast';

const VIEWS: { id: SchedulingView; label: string; icon: typeof Users; description: string }[] = [
  { id: 'board', label: 'Team Board', icon: Users, description: 'Drag tasks onto people to bulk-assign work' },
  { id: 'calendar', label: 'Team Calendar', icon: CalendarRange, description: 'Per-person schedule with drag-to-reschedule' },
  { id: 'forecast', label: 'Capacity Forecast', icon: LineChart, description: 'Studio headcount-days vs. availability' },
];

export default function Scheduling() {
  const { toast } = useToast();
  const [view, setView] = useState<SchedulingView>('board');
  const tasks = useTasksStore((s) => s.tasks);
  const reassignTask = useTasksStore((s) => s.reassignTask);
  const updateTaskStatus = useTasksStore((s) => s.updateTaskStatus);
  const addTask = useTasksStore((s) => s.addTask);

  const active = VIEWS.find((v) => v.id === view)!;

  // Finds every task actually stuck in the 'bottleneck' state and, per task,
  // reassigns it to the least-loaded active person in the same department
  // (falling back to leaving the assignee unchanged if nobody qualifies)
  // then moves it back into 'in-progress' — a real reassign/unblock via the
  // tasks store, not just a toast.
  const handleAutoResolve = () => {
    const bottlenecks = tasks.filter((t) => t.status === 'bottleneck');
    if (bottlenecks.length === 0) {
      toast({ title: 'No bottlenecks found', description: 'Every task is already on track.' });
      return;
    }
    bottlenecks.forEach((task) => {
      const dept = DEPARTMENTS.find((d) => d.name === task.department);
      const candidates = USERS
        .filter((u) => u.role !== 'client' && u.status === 'active' && u.id !== task.assigneeId)
        .filter((u) => !dept || u.departmentId === dept.id)
        .sort((a, b) => a.capacity - b.capacity);
      const replacement = candidates[0];
      if (replacement) reassignTask(task.id, replacement.id);
      updateTaskStatus(task.id, 'in-progress');
    });
    toast({
      title: 'Bottlenecks resolved',
      description: `Reassigned and unblocked ${bottlenecks.length} task${bottlenecks.length === 1 ? '' : 's'}.`,
    });
  };

  // Real (minimal, mock) import: adds a small batch of new tasks into the
  // first project via the tasks store, so the import actually changes
  // schedule state visible in Team Board / Team Calendar rather than just
  // toasting.
  const handleStartImport = () => {
    const project = PROJECTS[0];
    const dept = DEPARTMENTS[0];
    const assignees = USERS.filter((u) => u.departmentId === dept.id && u.role !== 'client');
    const assigner = USERS.find((u) => u.departmentId === dept.id && (u.role === 'supervisor' || u.role === 'lead')) ?? USERS[0];
    const now = new Date().toISOString();
    const importedCount = 3;
    const imported: Task[] = Array.from({ length: importedCount }).map((_, i) => ({
      id: `imported-${Date.now()}-${i}`,
      title: `Imported Shot ${i + 1}`,
      description: 'Created from Excel / CSV schedule import.',
      projectId: project.id,
      assigneeId: (assignees[i % assignees.length] ?? USERS[0]).id,
      assignedById: assigner.id,
      status: 'not-started',
      priority: 'medium',
      dueDate: addDays(now.split('T')[0], 14),
      estimatedHours: 8,
      actualHours: 0,
      tags: ['imported'],
      dependencies: [],
      checklist: [],
      comments: [],
      attachments: [],
      department: dept.name,
      createdAt: now,
      lastStatusUpdate: now,
      dailyLogs: [],
      pipelinePhase: dept.abbreviation,
      approvalHistory: [],
    }));
    imported.forEach(addTask);
    toast({ title: 'Import complete', description: `Imported ${imported.length} shots into ${project.name}.` });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-20 gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Scheduling</h1>
        </div>

        {/* Segmented view switcher */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg relative shrink-0">
          {VIEWS.map((v) => {
            const isActive = v.id === view;
            const Icon = v.icon;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  'relative px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-1.5 transition-colors',
                  isActive ? 'text-foreground hover:opacity-80' : 'text-muted-foreground hover:text-foreground/80 hover:bg-background/40',
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="scheduling-view-pill"
                    className="absolute inset-0 bg-background rounded-md shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {v.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
          <span className="text-xs text-muted-foreground hidden xl:block truncate">{active.description}</span>
          <Button variant="outline" size="sm" onClick={handleAutoResolve} className="border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 shrink-0">
            <Cpu className="w-4 h-4 mr-2" /> Auto-Resolve Bottlenecks
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                <Download className="w-4 h-4 mr-2" /> Import Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px]">
              <div className="space-y-6 py-2">
                <div>
                  <h2 className="text-lg font-semibold">Import Excel / CSV Schedule</h2>
                  <p className="text-sm text-muted-foreground mt-1">Map your spreadsheet columns to Forge fields to bulk import Shots and Tasks.</p>
                </div>

                <div className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-muted/30 transition-colors cursor-pointer group mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Download className="w-6 h-6 text-primary" />
                  </div>
                  <div className="font-semibold mb-1 text-sm">Upload Spreadsheet</div>
                  <div className="text-xs text-muted-foreground">Select a .csv or .xlsx file</div>
                </div>

                <div className="space-y-4 border border-border rounded-lg p-4 bg-muted/20">
                  <h3 className="text-sm font-medium border-b border-border/50 pb-2">Column Mapping</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Shot Name</label>
                      <Select defaultValue="col_a">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="col_a">Column A (Shot)</SelectItem>
                          <SelectItem value="col_b">Column B (Sequence)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Department</label>
                      <Select defaultValue="col_c">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="col_c">Column C (Dept)</SelectItem>
                          <SelectItem value="col_d">Column D (Assignee)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Start Date</label>
                      <Select defaultValue="col_e">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="col_e">Column E (Start)</SelectItem>
                          <SelectItem value="col_f">Column F (End)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Deadline</label>
                      <Select defaultValue="col_f">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="col_e">Column E (Start)</SelectItem>
                          <SelectItem value="col_f">Column F (End)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button onClick={handleStartImport}>Start Import</Button>
                  </DialogClose>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* View content */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-0"
          >
            {view === 'board' && <TeamBoard />}
            {view === 'calendar' && <TeamCalendar />}
            {view === 'forecast' && <CapacityForecast />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
