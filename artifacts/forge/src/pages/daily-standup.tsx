import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS, DEPARTMENTS } from '@/data/mockData';
import { useAuthStore } from '@/store/auth';
import { useTasksStore } from '@/store/tasks';
import { useStandupsStore } from '@/store/standups';
import { useUIStore } from '@/store/ui';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AlertCircle, CheckCircle2, MonitorPlay, ListVideo, GripVertical, PlayCircle, Plus, Calendar, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Image as ImageIcon, Video, Paperclip, Send } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { fadeInUp, DURATION } from '@/lib/motion';

export default function DailyStandup() {
  const { currentUser } = useAuthStore();
  const tasks = useTasksStore((s) => s.tasks);
  const updateTask = useTasksStore((s) => s.updateTask);
  const updateTaskStatus = useTasksStore((s) => s.updateTaskStatus);
  const standupUpdates = useStandupsStore((s) => s.updates);
  const addStandupUpdate = useStandupsStore((s) => s.addUpdate);
  const { setActiveTaskDrawer } = useUIStore();
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');
  const [playlist, setPlaylist] = useState<any[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [approvedUsers, setApprovedUsers] = useState<Set<string>>(new Set());
  const [updateText, setUpdateText] = useState('');
  const [updateHours, setUpdateHours] = useState('8');
  const [postTaskId, setPostTaskId] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logTaskId, setLogTaskId] = useState('');
  const [logHours, setLogHours] = useState('8');
  const [logNote, setLogNote] = useState('');
  const [feedApproved, setFeedApproved] = useState(false);
  const [feedApprovalCount, setFeedApprovalCount] = useState(3);
  const [feedCommentsOpen, setFeedCommentsOpen] = useState(false);
  const { toast } = useToast();

  // Tasks and standup updates now live in real, persisted Zustand stores
  // (see src/store/tasks.ts / src/store/standups.ts). This poll is a
  // connectivity heartbeat against the (decorative) apiClient stub, kept so
  // a real backend could slot in later; a failed poll surfaces as a
  // stale-data banner instead of only logging to the console.
  const fetchData = async () => {
    try {
      await Promise.all([apiClient.get('/tasks'), apiClient.get('/standups')]);
      setSyncError(false);
    } catch (e) {
      console.error(e);
      setSyncError(true);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const isAllDepts = selectedDeptId === 'ALL';
  const dept = isAllDepts ? null : DEPARTMENTS.find(d => d.id === selectedDeptId);
  const team = isAllDepts ? USERS : USERS.filter(u => u.departmentId === selectedDeptId);
  const isLeadership = currentUser?.role ? ['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role) : false;

  const pendingReviewTasks = tasks.filter(t =>
    (isAllDepts || t.department === dept?.name) && t.status === 'review'
  );

  // Updates posted from the "My Updates" form, mapped with the full user
  // object + a display time, the same shape the feed previously expected
  // from the apiClient stub.
  const feedUpdates = standupUpdates.map((update) => {
    const user = USERS.find(u => u.id === update.userId) || currentUser;
    return {
      ...update,
      user,
      time: new Date(update.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }).filter(update => {
    // RBAC: Main production managers see everything.
    if (['vfx_producer', 'production_manager'].includes(currentUser.role)) return true;
    
    // RBAC: Dept managers/leads see their dept + their own updates
    if (['supervisor', 'lead', 'coordinator'].includes(currentUser.role)) {
      return update.user?.departmentId === currentUser.departmentId || update.userId === currentUser.id;
    }
    
    // RBAC: Artists only see their own updates
    return update.userId === currentUser.id;
  });

  const payrollRows = useMemo(() => team.map(member => {
    const tasksWithLogs = tasks.filter(t => t.assigneeId === member.id);
    const today = new Date().toISOString().split('T')[0];
    let totalHoursToday = 0;
    tasksWithLogs.forEach(task => {
      const todaysLogs = task.dailyLogs.filter(log => log.date.startsWith(today) || true); // Defaulting to true for mock data visibility
      totalHoursToday += todaysLogs.reduce((acc, log) => acc + log.hours, 0);
    });
    const memberDept = DEPARTMENTS.find(d => d.id === member.departmentId);
    return {
      member,
      memberDept,
      totalHoursToday,
      isOverloaded: member.capacity > 95,
      isApproved: approvedUsers.has(member.id),
    };
  }), [team, tasks, approvedUsers]);

  if (!currentUser) return null;

  const myTasks = tasks.filter(t => t.assigneeId === currentUser.id);

  const addToPlaylist = (task: any) => {
    if (!playlist.find(p => p.id === task.id)) {
      setPlaylist([...playlist, task]);
      toast({ title: 'Added to Playlist', description: `${task.title} queued for dailies.` });
    }
  };

  const handleUnblock = (taskId: string) => {
    updateTaskStatus(taskId, 'in-progress');
    toast({ title: 'Task Unbottleneck', description: 'The task has been moved back to in-progress.' });
  };

  const handlePostUpdate = () => {
    if (!updateText.trim()) return;
    setIsPosting(true);
    // Small delay so the existing "Posting..." spinner state remains
    // visible, using the shared fast-cut duration from lib/motion.
    setTimeout(() => {
      addStandupUpdate({
        id: `su-${Date.now()}`,
        userId: currentUser.id,
        taskId: postTaskId || myTasks[0]?.id || null,
        text: updateText,
        hours: Number(updateHours) || 0,
        timestamp: new Date().toISOString(),
      });
      toast({ title: 'Update Posted!', description: 'Your daily progress has been shared.' });
      setUpdateText('');
      setIsPosting(false);
    }, DURATION.fast * 1000);
  };

  const handleLogUpdateSubmit = () => {
    const resolvedTaskId = logTaskId || myTasks[0]?.id;
    const hoursNum = parseFloat(logHours);
    if (!resolvedTaskId || !hoursNum || hoursNum <= 0) {
      toast({ title: 'Missing Info', description: 'Select a task and enter valid hours.', variant: 'destructive' });
      return;
    }
    const task = tasks.find(t => t.id === resolvedTaskId);
    if (!task) return;
    updateTask(task.id, {
      dailyLogs: [
        ...task.dailyLogs,
        {
          date: new Date().toISOString().slice(0, 10),
          hours: hoursNum,
          note: logNote.trim() || 'No notes provided.',
          userId: currentUser.id,
        },
      ],
      actualHours: task.actualHours + hoursNum,
    });
    toast({ title: 'Log Submitted', description: 'Your daily update has been recorded successfully.' });
    setLogDialogOpen(false);
    setLogTaskId('');
    setLogHours('8');
    setLogNote('');
  };

  const handleViewLogs = (memberId: string, memberName: string) => {
    const memberTasks = tasks.filter(t => t.assigneeId === memberId);
    const taskToOpen = memberTasks.find(t => t.dailyLogs.length > 0) || memberTasks[0];
    if (taskToOpen) {
      setActiveTaskDrawer(taskToOpen.id);
    } else {
      toast({ title: 'No Timesheet Data', description: `${memberName} has no logged tasks yet.` });
    }
  };

  const escapePayrollCSVValue = (value: unknown) => {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const handleExportPayrollCSV = () => {
    const headers = ['Employee', 'Role', 'Department', 'Status', 'Hours Today', 'Capacity %', 'Timesheet Approved'];
    const rows = payrollRows.map(({ member, memberDept, totalHoursToday, isApproved }) => [
      member.name,
      member.title,
      memberDept?.name ?? '',
      member.status === 'active' ? 'Punched In' : 'Away',
      totalHoursToday,
      member.capacity,
      isApproved ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escapePayrollCSVValue).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-attendance-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: 'Export Complete', description: `${payrollRows.length} employee records exported to CSV.` });
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MonitorPlay className="w-8 h-8 text-primary" />
            Daily Standup
          </h1>
          <p className="text-muted-foreground mt-1">Review team progress, blockers, and build daily playlists</p>
        </div>
        
        {/* Department Switcher */}
        {isLeadership && (
          <select 
            className="h-10 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
          >
            <option value="ALL">All Departments (Studio-Wide)</option>
            {DEPARTMENTS.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      <AnimatePresence>
        {syncError && (
          <motion.div
            {...fadeInUp}
            className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Live sync failed — showing last known data. Retrying automatically…
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs defaultValue={isLeadership ? "overview" : "updates"} className="w-full">
        <TabsList className="mb-4">
          {isLeadership && (
            <>
              <TabsTrigger value="overview">Team Overview</TabsTrigger>
              <TabsTrigger value="playlist" className="flex items-center gap-2">
                <ListVideo className="w-4 h-4" /> Dailies Playlist Builder
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="updates" className="flex items-center gap-2">
            <ListVideo className="w-4 h-4" /> My Updates & Feed
          </TabsTrigger>
          {['vfx_producer', 'production_manager', 'supervisor'].includes(currentUser.role) && (
            <TabsTrigger value="payroll" className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <CheckCircle2 className="w-4 h-4" /> Payroll & Attendance
            </TabsTrigger>
          )}
        </TabsList>

        {isLeadership && (
          <>
            <TabsContent value="overview">
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
              {/* Bottleneck or At Risk */}
              <div>
                 <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                   <AlertCircle className="w-5 h-5 text-red-500" />
                   Bottleneck / Needs Attention
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {tasks.filter(t => (isAllDepts || t.department === dept?.name) && (t.status === 'bottleneck' || t.weeklyRating === 'at-risk' || t.weeklyRating === 'behind')).slice(0, 4).map(task => {
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
                             <Button 
                                 size="sm" 
                                 variant="outline" 
                                 className="h-7 text-xs border-red-500/20 hover:bg-red-500/10 hover:text-red-500"
                                 onClick={() => handleUnblock(task.id)}
                               >
                                 Unblock
                               </Button>
                           </div>
                         </CardContent>
                       </Card>
                     )
                   })}
                 </div>
              </div>

              {/* Yesterday's Progress / Daily Logs */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                     <CheckCircle2 className="w-5 h-5 text-green-500" />
                     Recent Progress & Daily Logs
                  </h3>
                  <Dialog open={logDialogOpen} onOpenChange={(open) => {
                    setLogDialogOpen(open);
                    if (open) setLogTaskId(myTasks[0]?.id ?? '');
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                        <Plus className="w-4 h-4 mr-2" /> Log Update
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Submit Daily Log</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Task</Label>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={logTaskId}
                            onChange={(e) => setLogTaskId(e.target.value)}
                          >
                            {myTasks.length === 0 && <option value="">No tasks assigned</option>}
                            {myTasks.map(t => (
                              <option key={t.id} value={t.id}>{t.title}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>Hours Spent</Label>
                          <Input type="number" value={logHours} onChange={(e) => setLogHours(e.target.value)} min="0" max="24" />
                        </div>
                        <div className="space-y-2">
                          <Label>Update Notes</Label>
                          <textarea
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder="What did you accomplish today? Any blockers?"
                            value={logNote}
                            onChange={(e) => setLogNote(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleLogUpdateSubmit} disabled={myTasks.length === 0}>Submit Update</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                <Card className="border-border/50">
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {tasks.filter(t => (isAllDepts || t.department === dept?.name) && t.dailyLogs.length > 0).slice(0, 8).map(task => {
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
        </TabsContent>

        <TabsContent value="playlist">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left: Pending Reviews */}
            <div className="xl:col-span-1 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Ready for Review</h3>
                <Badge variant="secondary">{pendingReviewTasks.length}</Badge>
              </div>
              <Card className="border-border/50 bg-muted/10 h-[600px] overflow-y-auto">
                <CardContent className="p-3 space-y-2">
                  {pendingReviewTasks.map(task => {
                    const assignee = USERS.find(u => u.id === task.assigneeId);
                    return (
                      <div key={task.id} className="p-3 bg-card border border-border rounded-lg group hover:border-primary/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-medium text-sm">{task.title}</div>
                          <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-primary" onClick={() => addToPlaylist(task)}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Avatar className="w-5 h-5"><AvatarImage src={assignee?.avatar} /></Avatar>
                          {assignee?.name}
                        </div>
                      </div>
                    )
                  })}
                  {pendingReviewTasks.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">No tasks pending review in this department.</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Playlist Builder timeline */}
            <div className="xl:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <ListVideo className="w-5 h-5 text-purple-500" /> Morning Dailies Playlist
                </h3>
                <Button 
                  className={sessionActive ? "bg-green-600 hover:bg-green-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"} 
                  disabled={playlist.length === 0 && !sessionActive}
                  onClick={() => {
                    if (sessionActive) {
                      setSessionActive(false);
                      setPlaylist([]);
                      toast({ title: 'Session Ended', description: 'Playlist cleared.' });
                    } else {
                      setSessionActive(true);
                      toast({ title: 'Dailies Session Started', description: `Launched RV with ${playlist.length} shots queued.` });
                    }
                  }}
                >
                  <PlayCircle className="w-4 h-4 mr-2" /> {sessionActive ? 'End Session' : 'Start Dailies Session'}
                </Button>
              </div>
              
              <Card className="border-purple-500/20 bg-purple-500/5 h-[600px]">
                <CardContent className="p-6">
                  {playlist.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 border-2 border-dashed border-purple-500/20 rounded-xl bg-card/50">
                      <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center">
                        <ListVideo className="w-8 h-8 text-purple-500" />
                      </div>
                      <p>Click the '+' on a task to add it to today's playlist</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {playlist.map((task, idx) => {
                        const assignee = USERS.find(u => u.id === task.assigneeId);
                        return (
                          <div key={task.id} className="flex items-center gap-4 p-3 bg-card border border-border rounded-lg shadow-sm group">
                            <div className="cursor-grab text-muted-foreground hover:text-foreground">
                              <GripVertical className="w-5 h-5" />
                            </div>
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center font-mono text-xs text-muted-foreground font-bold">
                              {String(idx + 1).padStart(2, '0')}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-sm">{task.title}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                                <Avatar className="w-4 h-4"><AvatarImage src={assignee?.avatar} /></Avatar>
                                {assignee?.name} • v001
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setPlaylist(playlist.filter(p => p.id !== task.id))}>
                              Remove
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
          </>
        )}

        {/* --- NEW TAB: MY UPDATES --- */}
        <TabsContent value="updates">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left: Log Update Form */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" /> Post Daily Update
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Task</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={postTaskId || myTasks[0]?.id || ''}
                      onChange={(e) => setPostTaskId(e.target.value)}
                    >
                      {myTasks.length === 0 && <option value="">No tasks assigned</option>}
                      {myTasks.map(t => (
                        <option key={t.id} value={t.id} className="bg-background">{t.title}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Hours Logged</Label>
                    <Input type="number" value={updateHours} onChange={(e) => setUpdateHours(e.target.value)} min="0" max="24" className="h-9" />
                  </div>

                  <div className="space-y-2">
                    <Label>What did you accomplish?</Label>
                    <Textarea 
                      placeholder="Write your update here... Mention any blockers."
                      value={updateText}
                      onChange={(e) => setUpdateText(e.target.value)}
                      className="min-h-[100px] resize-none"
                    />
                  </div>
                  
                  {/* Media Upload Area */}
                  <div className="space-y-2">
                    <Label>Attachments (Optional)</Label>
                    <div className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center hover:bg-muted/30 transition-colors cursor-pointer group">
                      <div className="flex justify-center gap-4 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                        <ImageIcon className="w-6 h-6" />
                        <Video className="w-6 h-6" />
                        <Paperclip className="w-6 h-6" />
                      </div>
                      <p className="text-xs text-muted-foreground">Drag & drop images, shorts, or videos here</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Supports MP4, MOV, JPG, PNG (Max 50MB)</p>
                    </div>
                  </div>

                  <Button className="w-full mt-2" onClick={handlePostUpdate} disabled={isPosting}>
                    {isPosting ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {isPosting ? 'Posting...' : 'Post Update'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right: Team Feed */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-semibold text-lg mb-4">Team Updates Feed</h3>
              
              {/* Dynamic User Updates */}
              {feedUpdates.map((update) => (
                <Card key={update.id} className="border-primary/50 bg-primary/5 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                  <CardContent className="p-0">
                    <div className="p-4 flex items-start gap-3">
                      <Avatar className="w-10 h-10 border border-primary/50">
                        <AvatarImage src={update.user?.avatar} />
                        <AvatarFallback>{update.user?.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between">
                          <div className="font-semibold text-sm">{update.user?.name}</div>
                          <div className="text-xs text-muted-foreground">{update.time}</div>
                        </div>
                        <div className="text-xs text-primary mb-2 flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px] h-5 border-primary/30 bg-primary/10">Recent Update</Badge>
                          <span className="text-muted-foreground ml-1">logged {update.hours}h</span>
                        </div>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                          {update.text}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {/* Mock Feed Item 1 (With Image/Video) */}
              {(['vfx_producer', 'production_manager'].includes(currentUser.role) || currentUser.departmentId === USERS[2]?.departmentId) && (
              <Card className="border-border/50 bg-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 border-b border-border/50 flex items-start gap-3">
                    <Avatar className="w-10 h-10 border border-border/50">
                      <AvatarImage src={USERS[2]?.avatar} />
                      <AvatarFallback>A</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <div className="font-semibold text-sm">{USERS[2]?.name}</div>
                        <div className="text-xs text-muted-foreground">2 hours ago</div>
                      </div>
                      <div className="text-xs text-primary mb-2 flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] h-5 border-primary/30 bg-primary/10">Anim: Robot Walk Cycle</Badge>
                        <span className="text-muted-foreground ml-1">logged 8h</span>
                      </div>
                      <p className="text-sm text-foreground/90">
                        Finished blocking out the main walk cycle for the hero robot. Timing feels much better now. I've attached a quick playblast for review. Let me know if the weight distribution looks right on the left leg!
                      </p>
                    </div>
                  </div>
                  {/* Media Attachment */}
                  <div className="bg-black relative aspect-video group cursor-pointer">
                    {/* Placeholder image from artifact */}
                    <img src="/src/assets/daily_update_video_thumbnail.png" alt="Playblast Thumbnail" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Play Button Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 bg-primary/90 text-primary-foreground rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <PlayCircle className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                      0:12
                    </div>
                  </div>
                  
                  {/* Feed Item Footer / Interactions */}
                  <div className="p-3 bg-muted/20 flex gap-4 text-xs font-medium text-muted-foreground">
                    <button
                      className={cn(
                        'flex items-center gap-1.5 hover:text-primary transition-colors',
                        feedApproved && 'text-primary',
                      )}
                      onClick={() => {
                        setFeedApproved((prev) => !prev);
                        setFeedApprovalCount((prev) => (feedApproved ? prev - 1 : prev + 1));
                      }}
                    >
                      <CheckCircle2 className={cn('w-4 h-4', feedApproved && 'fill-primary/20')} /> {feedApprovalCount} Approval{feedApprovalCount === 1 ? '' : 's'}
                    </button>
                    <button
                      className={cn(
                        'flex items-center gap-1.5 hover:text-primary transition-colors',
                        feedCommentsOpen && 'text-primary',
                      )}
                      onClick={() => setFeedCommentsOpen((prev) => !prev)}
                    >
                      <MessageSquare className="w-4 h-4" /> 2 Comments
                    </button>
                  </div>
                  {feedCommentsOpen && (
                    <div className="px-4 pb-4 pt-1 space-y-2 border-t border-border/50 bg-muted/10">
                      <div className="flex items-start gap-2 pt-3 text-xs">
                        <Avatar className="w-6 h-6 shrink-0"><AvatarImage src={USERS[1]?.avatar} /><AvatarFallback>{USERS[1]?.name.charAt(0)}</AvatarFallback></Avatar>
                        <div><span className="font-semibold">{USERS[1]?.name}</span> <span className="text-muted-foreground">Weight looks great now, ship it.</span></div>
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <Avatar className="w-6 h-6 shrink-0"><AvatarImage src={USERS[2]?.avatar} /><AvatarFallback>{USERS[2]?.name.charAt(0)}</AvatarFallback></Avatar>
                        <div><span className="font-semibold">{USERS[2]?.name}</span> <span className="text-muted-foreground">Agreed, left leg reads much better.</span></div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              )}

              {/* Mock Feed Item 2 (Text Only) */}
              {(['vfx_producer', 'production_manager'].includes(currentUser.role) || currentUser.departmentId === USERS[1]?.departmentId) && (
              <Card className="border-border/50 bg-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 flex items-start gap-3">
                    <Avatar className="w-10 h-10 border border-border/50">
                      <AvatarImage src={USERS[1]?.avatar} />
                      <AvatarFallback>A</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <div className="font-semibold text-sm">{USERS[1]?.name}</div>
                        <div className="text-xs text-muted-foreground">4 hours ago</div>
                      </div>
                      <div className="text-xs text-primary mb-2 flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] h-5 border-blue-500/30 text-blue-500 bg-blue-500/10">Layout: Bridge Sequence</Badge>
                        <span className="text-muted-foreground ml-1">logged 4h</span>
                      </div>
                      <p className="text-sm text-foreground/90">
                        Camera tracking is finally matching the plate. Will push the USD to the farm tonight so lighting can pick it up tomorrow morning.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )}

            </div>
          </div>
        </TabsContent>

        {/* --- NEW TAB: PAYROLL & ATTENDANCE --- */}
        {['vfx_producer', 'production_manager', 'supervisor'].includes(currentUser.role) && (
          <TabsContent value="payroll">
            <Card className="border-border/50 bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Studio Payroll & Attendance</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Monitor logged hours and active statuses for {isAllDepts ? 'the entire studio' : dept?.name}.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportPayrollCSV}>Export CSV</Button>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                    const allMemberIds = new Set(team.map(m => m.id));
                    setApprovedUsers(allMemberIds);
                    toast({ title: 'Timesheets Approved', description: `Approved hours for ${team.length} employees.` });
                  }}>Approve Timesheets</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-border">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3">Artist / Employee</th>
                        <th className="px-4 py-3">Role & Dept</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-center">Hours Today</th>
                        <th className="px-4 py-3 text-center">Capacity</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payrollRows.map(({ member, memberDept, totalHoursToday, isOverloaded, isApproved }) => {
                        return (
                          <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={member.avatar} />
                                  <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{member.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm">{member.title}</div>
                              <div className="text-xs text-muted-foreground">{memberDept?.name}</div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {member.status === 'active' ? (
                                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">PUNCHED IN</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">AWAY</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-mono relative">
                              <span className={totalHoursToday === 0 ? 'text-muted-foreground opacity-50' : (totalHoursToday > 8 ? 'text-amber-500 font-bold' : 'text-primary font-bold')}>
                                {totalHoursToday}h
                              </span>
                              {isApproved && totalHoursToday > 0 && <CheckCircle2 className="w-3 h-3 text-green-500 absolute top-1/2 -translate-y-1/2 right-4" />}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isOverloaded ? 'bg-red-500' : 'bg-green-500'}`} />
                                <span>{member.capacity}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleViewLogs(member.id, member.name)}>View Logs</Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {team.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">No employees found in this view.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
