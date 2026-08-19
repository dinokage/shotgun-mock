import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { useTasksStore } from '@/store/tasks';
import { useTimesheetLogs, addTimeLog, updateTimeLog, deleteTimeLog, type TimeLog } from '@/store/timesheets';
import { useIsLeadership } from '@/hooks/use-capability';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { PROJECTS, USERS, DEPARTMENTS } from '@/data/mockData';
import { Clock, Plus, CheckCircle2, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Save, Pencil, Trash2, X } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useToast } from '@/hooks/use-toast';

export default function Timesheets() {
  const { currentUser } = useAuthStore();
  const { toast } = useToast();
  const { setActiveTaskDrawer } = useUIStore();

  // Derived from Task.dailyLogs (store/tasks.ts) — the same canonical data
  // TaskDrawer reads and writes, so this page can never disagree with it.
  const logs = useTimesheetLogs();

  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [newTaskSelection, setNewTaskSelection] = useState<string>('');
  const [newHours, setNewHours] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [confirmPulse, setConfirmPulse] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const isManager = useIsLeadership();
  const tasks = useTasksStore((state) => state.tasks);

  if (!currentUser) return null;

  // Get date range for the week
  const today = new Date();
  today.setDate(today.getDate() + (currentWeekOffset * 7));
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday

  // Managers can log time against their own department's tasks or their
  // direct reports' tasks — not the entire studio's ~300 tasks. Everyone
  // else only sees tasks assigned to them.
  // Task.department stores the department's *name* (e.g. "Animation"),
  // while User.departmentId stores its *id* (e.g. "dept2") — comparing
  // them directly never matched, so a manager's own department's tasks
  // (for anyone who wasn't also their direct report) silently never
  // showed up here. Resolve the manager's department name first.
  const currentUserDeptName = DEPARTMENTS.find(d => d.id === currentUser.departmentId)?.name;
  const directReportIds = new Set(USERS.filter(u => u.supervisorId === currentUser.id).map(u => u.id));
  const myTasks = tasks.filter(t =>
    t.assigneeId === currentUser.id ||
    (isManager && (t.department === currentUserDeptName || directReportIds.has(t.assigneeId)))
  );
  const filteredTasks = myTasks.filter(t => {
    if (!taskSearch.trim()) return true;
    const proj = PROJECTS.find(p => p.id === t.projectId);
    return `${proj?.name ?? ''} ${t.title}`.toLowerCase().includes(taskSearch.trim().toLowerCase());
  });

  // Scope the visible log entries the same way myTasks is scoped above — a
  // manager should only see logs against their own department's or direct
  // reports' tasks, not literally every log in the studio. Previously this
  // used `isManager ? true : ...`, which showed every user's logs on every
  // task studio-wide for any manager, contradicting both the comment above
  // and the "All Team Logs" badge's implied (team-scoped, not studio-wide) meaning.
  const myTaskIds = new Set(myTasks.map(t => t.id));
  const weekLogs = logs.filter(l => {
    const logDate = new Date(l.date);
    if (logDate < startOfWeek || logDate > endOfWeek) return false;
    return isManager ? myTaskIds.has(l.taskId) : l.userId === currentUser.id;
  });

  const totalHours = weekLogs.reduce((acc, curr) => acc + curr.hours, 0);

  const handleAddLog = () => {
    if (!newTaskSelection || !newHours) {
      toast({ title: 'Error', description: 'Please select a task and enter hours.', variant: 'destructive' });
      return;
    }
    
    const parsedHours = parseFloat(newHours);
    if (isNaN(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
      toast({ title: 'Invalid Hours', description: 'Please enter a valid number of hours (0-24).', variant: 'destructive' });
      return;
    }

    // The new entry lands at the end of the target task's dailyLogs array —
    // compute its id (taskId::index) up front so we can highlight it below.
    const targetTask = tasks.find(t => t.id === newTaskSelection);
    const newLogId = `${newTaskSelection}::${targetTask?.dailyLogs.length ?? 0}`;

    addTimeLog({
      taskId: newTaskSelection,
      userId: currentUser.id,
      date: new Date(today).toISOString().split('T')[0],
      hours: parsedHours,
      notes: newNotes,
    });
    setNewTaskSelection('');
    setNewHours('');
    setNewNotes('');
    toast({ title: 'Time Logged', description: `Successfully logged ${parsedHours} hours.` });

    // Confirmation micro-interaction: pulse the submit button and highlight the new entry
    setJustAddedId(newLogId);
    setConfirmPulse(true);
    window.setTimeout(() => setConfirmPulse(false), 900);
    window.setTimeout(() => setJustAddedId(null), 1600);
  };

  const startEditLog = (log: TimeLog) => {
    setEditingLogId(log.id);
    setEditHours(String(log.hours));
    setEditNotes(log.notes);
  };

  const cancelEditLog = () => {
    setEditingLogId(null);
    setEditHours('');
    setEditNotes('');
  };

  const saveEditLog = (id: string) => {
    const parsedHours = parseFloat(editHours);
    if (isNaN(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
      toast({ title: 'Invalid Hours', description: 'Please enter a valid number of hours (0-24).', variant: 'destructive' });
      return;
    }
    updateTimeLog(id, { hours: parsedHours, notes: editNotes });
    toast({ title: 'Time Log Updated', description: `Updated to ${parsedHours} hours.` });
    cancelEditLog();
  };

  const handleDeleteLog = (log: TimeLog) => {
    deleteTimeLog(log.id);
    toast({ title: 'Time Log Deleted', description: `Removed ${log.hours}h entry.` });
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Timesheets</h1>
          <p className="text-muted-foreground mt-1">Track your time against assigned tasks.</p>
        </div>
        <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-lg border border-border">
          <Button variant="ghost" size="icon" onClick={() => setCurrentWeekOffset(prev => prev - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 font-medium min-w-[200px] justify-center">
            <CalendarIcon className="w-4 h-4 text-primary" />
            {startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCurrentWeekOffset(prev => prev + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left Column: Summary */}
        <div className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">This Week's Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-accent-tally flex items-baseline gap-2 timecode">
                {totalHours.toFixed(1)} <span className="text-lg text-muted-foreground font-normal">hrs</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3 bg-muted/20 border-b border-border/50">
              <CardTitle className="text-base font-semibold">Log New Time</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Select Task</label>
                <Select value={newTaskSelection} onValueChange={setNewTaskSelection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a task..." />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 bg-popover p-1.5 border-b border-border">
                      <Input
                        placeholder="Search tasks..."
                        value={taskSearch}
                        onChange={(e) => setTaskSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8 text-xs"
                      />
                    </div>
                    {filteredTasks.length === 0 ? (
                      <div className="px-2 py-4 text-xs text-muted-foreground text-center">No matching tasks</div>
                    ) : (
                      filteredTasks.map(t => {
                        const proj = PROJECTS.find(p => p.id === t.projectId);
                        return (
                          <SelectItem key={t.id} value={t.id}>
                            {proj?.name}: {t.title}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Hours</label>
                <Input 
                  type="number" 
                  min="0.25" 
                  step="0.25" 
                  max="24"
                  placeholder="e.g. 4.5"
                  value={newHours}
                  onChange={(e) => setNewHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Notes (Optional)</label>
                <Input 
                  placeholder="What did you work on?"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </div>
              <Button className="w-full mt-2 gap-2 relative overflow-hidden" onClick={handleAddLog} disabled={confirmPulse}>
                <AnimatePresence mode="wait" initial={false}>
                  {confirmPulse ? (
                    <motion.span
                      key="confirmed"
                      className="flex items-center gap-2"
                      initial={{ opacity: 0, y: 6, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.9 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                      <CheckCircle2 className="w-4 h-4" /> Logged!
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      className="flex items-center gap-2"
                      initial={{ opacity: 0, y: 6, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.9 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                      <Plus className="w-4 h-4" /> Add Time Log
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Time Logs List */}
        <div className="md:col-span-3">
          <Card className="border-border shadow-sm min-h-[500px]">
            <CardHeader className="pb-2 flex flex-row items-center justify-between bg-muted/10 border-b border-border/50">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" /> Logged Entries
              </CardTitle>
              {isManager && <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded font-medium border border-amber-500/30">Manager View: All Team Logs</span>}
            </CardHeader>
            <CardContent className="p-0">
              {weekLogs.length === 0 ? (
                <Empty className="h-64 border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Clock className="w-6 h-6" />
                    </EmptyMedia>
                    <EmptyTitle>No time logged</EmptyTitle>
                    <EmptyDescription>Nothing has been logged for this week yet.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {weekLogs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(log => {
                      const task = tasks.find(t => t.id === log.taskId);
                      const project = PROJECTS.find(p => p.id === task?.projectId);
                      const user = USERS.find(u => u.id === log.userId);
                      const isNew = log.id === justAddedId;
                      const isOwn = log.userId === currentUser.id;
                      const isEditing = editingLogId === log.id;

                      return (
                        <motion.div
                          key={log.id}
                          layout
                          initial={{ opacity: 0, y: -12, scale: 0.98 }}
                          animate={{
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            backgroundColor: isNew ? 'hsl(var(--accent-tally) / 0.08)' : 'hsl(var(--accent-tally) / 0)',
                          }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                          className="p-4 flex items-start justify-between hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex gap-4">
                            <div className="w-16 h-16 rounded-md bg-muted/50 border border-border flex flex-col items-center justify-center shrink-0">
                              <span className="text-xs text-muted-foreground uppercase">{new Date(log.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                              <span className="text-xl font-bold">{new Date(log.date).getDate()}</span>
                            </div>
                            <div>
                              {task ? (
                                <button
                                  type="button"
                                  className="font-semibold text-lg hover:text-primary cursor-pointer transition-colors text-left"
                                  onClick={() => setActiveTaskDrawer(task.id)}
                                >
                                  {task.title}
                                </button>
                              ) : (
                                <div className="font-semibold text-lg text-muted-foreground">Unknown Task</div>
                              )}
                              <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                                <span className="text-accent-scope font-medium">{project?.name}</span>
                                {isManager && (
                                  <>
                                    <span className="opacity-50">•</span>
                                    <span>{user?.name}</span>
                                  </>
                                )}
                              </div>
                              {isEditing ? (
                                <div className="mt-2 space-y-1.5">
                                  <Input
                                    type="text"
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="What did you work on?"
                                    className="h-8 text-sm"
                                  />
                                </div>
                              ) : (
                                log.notes && <div className="text-sm mt-2 italic text-foreground/80">"{log.notes}"</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-2">
                            {isEditing ? (
                              <Input
                                type="number"
                                min="0.25"
                                step="0.25"
                                max="24"
                                value={editHours}
                                onChange={(e) => setEditHours(e.target.value)}
                                className="w-24 h-9 text-right timecode"
                                autoFocus
                              />
                            ) : (
                              <div className="text-xl font-bold text-accent-tally bg-accent-tally/10 px-3 py-1 rounded-md border border-accent-tally/20 timecode">
                                {log.hours} <span className="text-sm font-normal text-muted-foreground">hrs</span>
                              </div>
                            )}
                            {task && <StatusBadge status={task.status} />}
                            {isOwn && (
                              <div className="flex items-center gap-1 mt-1">
                                {isEditing ? (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEditLog(log.id)} aria-label="Save changes">
                                      <Save className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEditLog} aria-label="Cancel editing">
                                      <X className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEditLog(log)} aria-label="Edit time log">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-500 hover:bg-red-500/10" aria-label="Delete time log">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete this time log?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will remove the {log.hours}h entry on {task?.title || 'this task'} and reduce its logged hours. This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteLog(log)}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
