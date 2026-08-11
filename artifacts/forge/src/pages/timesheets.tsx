import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TASKS, PROJECTS, USERS } from '@/data/mockData';
import { Clock, Plus, CheckCircle2, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Save } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useToast } from '@/hooks/use-toast';

interface TimeLog {
  id: string;
  taskId: string;
  userId: string;
  date: string;
  hours: number;
  notes: string;
}

export default function Timesheets() {
  const { currentUser } = useAuthStore();
  const { toast } = useToast();
  
  // Local state for mock time logs
  const [logs, setLogs] = useState<TimeLog[]>([
    { id: 'log1', taskId: 't1', userId: currentUser?.id || 'u1', date: new Date().toISOString().split('T')[0], hours: 4, notes: 'Blocking animation' },
    { id: 'log2', taskId: 't2', userId: currentUser?.id || 'u1', date: new Date().toISOString().split('T')[0], hours: 3.5, notes: 'Initial lighting setup' }
  ]);

  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [newTaskSelection, setNewTaskSelection] = useState<string>('');
  const [newHours, setNewHours] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');

  if (!currentUser) return null;

  const isManager = ['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role);
  
  // Get date range for the week
  const today = new Date();
  today.setDate(today.getDate() + (currentWeekOffset * 7));
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday

  const myTasks = TASKS.filter(t => t.assigneeId === currentUser.id || isManager);
  
  const weekLogs = logs.filter(l => {
    const logDate = new Date(l.date);
    return logDate >= startOfWeek && logDate <= endOfWeek && (isManager ? true : l.userId === currentUser.id);
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

    const newLog: TimeLog = {
      id: `log${Date.now()}`,
      taskId: newTaskSelection,
      userId: currentUser.id,
      date: new Date(today).toISOString().split('T')[0],
      hours: parsedHours,
      notes: newNotes
    };

    setLogs([newLog, ...logs]);
    setNewTaskSelection('');
    setNewHours('');
    setNewNotes('');
    toast({ title: 'Time Logged', description: `Successfully logged ${parsedHours} hours.` });
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
              <div className="text-4xl font-bold text-primary flex items-baseline gap-2">
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
                    {myTasks.map(t => {
                      const proj = PROJECTS.find(p => p.id === t.projectId);
                      return (
                        <SelectItem key={t.id} value={t.id}>
                          {proj?.name}: {t.title}
                        </SelectItem>
                      );
                    })}
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
              <Button className="w-full mt-2 gap-2" onClick={handleAddLog}>
                <Plus className="w-4 h-4" /> Add Time Log
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
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Clock className="w-12 h-12 mb-4 opacity-20" />
                  <p>No time logged for this week.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {weekLogs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(log => {
                    const task = TASKS.find(t => t.id === log.taskId);
                    const project = PROJECTS.find(p => p.id === task?.projectId);
                    const user = USERS.find(u => u.id === log.userId);
                    
                    return (
                      <div key={log.id} className="p-4 flex items-start justify-between hover:bg-muted/20 transition-colors">
                        <div className="flex gap-4">
                          <div className="w-16 h-16 rounded-md bg-muted/50 border border-border flex flex-col items-center justify-center shrink-0">
                            <span className="text-xs text-muted-foreground uppercase">{new Date(log.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                            <span className="text-xl font-bold">{new Date(log.date).getDate()}</span>
                          </div>
                          <div>
                            <div className="font-semibold text-lg hover:text-primary cursor-pointer transition-colors">{task?.title || 'Unknown Task'}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span className="text-primary font-medium">{project?.name}</span>
                              {isManager && (
                                <>
                                  <span className="opacity-50">•</span>
                                  <span>{user?.name}</span>
                                </>
                              )}
                            </div>
                            {log.notes && <div className="text-sm mt-2 italic text-foreground/80">"{log.notes}"</div>}
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          <div className="text-xl font-bold text-primary bg-primary/10 px-3 py-1 rounded-md border border-primary/20">
                            {log.hours} <span className="text-sm font-normal text-muted-foreground">hrs</span>
                          </div>
                          {task && <StatusBadge status={task.status} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
