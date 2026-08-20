import { useState, useMemo, type MouseEvent } from 'react';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS, PROJECTS, DEPARTMENTS } from '@/data/mockData';
import { useTasksStore } from '@/store/tasks';
import { Search, ListTodo, LayoutGrid, List, Calendar, Filter, CheckCircle2, Clock, AlertTriangle, Circle, Play, UserCheck } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PriorityChip } from '@/components/shared/PriorityChip';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { useUIStore } from '@/store/ui';
import KanbanView from './project-detail/TasksKanban';
import { apiClient } from '@/lib/apiClient';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { DEPARTMENT_LEADERSHIP_ROLES } from '@/store/permissions';
import { cn } from '@/lib/utils';

const STATUS_ICONS: Record<string, typeof Circle> = {
  'not-started': Circle,
  'in-progress': Clock,
  'review': AlertTriangle,
  'complete': CheckCircle2,
  'bottleneck': AlertTriangle,
};

type ViewMode = 'list' | 'kanban';

export default function Tasks() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  // Defaults are role-aware from first render (via getState(), not a
  // subscription — this only needs the value once, on mount): artists think
  // in pipeline stages, so kanban is their default and the table is the
  // opt-in; leads/supervisors land straight on their review queue instead of
  // the full unfiltered task list.
  const [view, setView] = useState<ViewMode>(() => {
    const role = useAuthStore.getState().currentUser?.role;
    return role && ['senior_artist', 'artist', 'junior_artist'].includes(role) ? 'kanban' : 'list';
  });
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(() => {
    const role = useAuthStore.getState().currentUser?.role;
    return !!role && DEPARTMENT_LEADERSHIP_ROLES.includes(role);
  });
  const isMobile = useIsMobile();
  const liveTasks = useTasksStore(state => state.tasks);
  const recordApprovalEvent = useTasksStore(state => state.recordApprovalEvent);
  const completeTask = useTasksStore(state => state.completeTask);
  const liveUsers = USERS;
  const liveProjects = PROJECTS;
  const liveDepartments = DEPARTMENTS;
  const { setActiveTaskDrawer, setCreateTaskModalOpen } = useUIStore();
  const { toast } = useToast();

  const { currentUser } = useAuthStore();
  
  const handleCompleteTask = (taskId: string) => {
    completeTask(taskId);
    toast({
      title: "Task Completed",
      description: "Task marked as complete locally.",
    });
  };

  // Shared by both the desktop table row and the mobile card so the
  // "Submit" quick action stays a single source of truth instead of two
  // copies of the same approval-chain call drifting apart.
  const handleSubmitForReview = (e: MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (!currentUser) return;
    // Route through recordApprovalEvent (not the old submitForReview, which
    // only set status without appending an audit-trail entry) so this quick
    // action produces the same real, persisted approval-chain history as
    // TaskDrawer's equivalent "Submit for Lead Review" action.
    recordApprovalEvent(taskId, 'review', {
      action: 'submitted-for-lead-review',
      byUserId: currentUser.id,
      byUserName: currentUser.name,
      byRole: currentUser.role,
    });
    toast({ title: 'Submitted for Lead Review' });
  };

  // RBAC Setup
  const isArtist = currentUser ? ['senior_artist', 'artist', 'junior_artist'].includes(currentUser.role) : true;
  // If artist, strictly force myTasksOnly to true
  const forceMyTasksOnly = isArtist;
  const effectiveMyTasksOnly = forceMyTasksOnly || myTasksOnly;

  const currentUserId = currentUser?.id || liveUsers[0]?.id || 'u1';

  // Same department-leadership convention SupervisorDashboard/home.tsx use
  // (DEPARTMENT_LEADERSHIP_ROLES = 'supervisor' + 'lead') to decide who gets
  // a personal review queue, rather than inventing a new role check here.
  const isLeadOrSupervisor = !!currentUser && DEPARTMENT_LEADERSHIP_ROLES.includes(currentUser.role);
  // Tasks carry a department *name* (t.department), while the user only has
  // a departmentId — resolve it the same way home.tsx's SupervisorDashboard
  // does before comparing.
  const myDepartmentName = currentUser
    ? liveDepartments.find(d => d.id === currentUser.departmentId)?.name
    : undefined;

  const filtered = useMemo(() => {
    return liveTasks.filter(t => {
      // 0. Quick filter: "Needs My Review" (lead/supervisor only) — a
      // standalone preset that shows exactly what's awaiting this user's
      // department review, bypassing the manual filter controls below.
      if (needsReviewOnly) {
        const awaitingReview = t.status === 'review' || t.status === 'lead-review';
        const inMyDepartment = !myDepartmentName || t.department === myDepartmentName;
        return awaitingReview && inMyDepartment;
      }

      // 1. RBAC Enforcements
      if (forceMyTasksOnly && t.assigneeId !== currentUserId) return false;

      // 2. UI Filters
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (projectFilter !== 'all' && t.projectId !== projectFilter) return false;
      if (departmentFilter !== 'all' && t.department !== departmentFilter) return false;
      if (!forceMyTasksOnly && myTasksOnly && t.assigneeId !== currentUserId) return false;

      return true;
    });
  }, [search, statusFilter, priorityFilter, projectFilter, departmentFilter, myTasksOnly, forceMyTasksOnly, currentUserId, liveTasks, needsReviewOnly, myDepartmentName]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: liveTasks.length };
    liveTasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return counts;
  }, [liveTasks]);

  // Count for the "Needs My Review" quick filter — always computed off the
  // full unfiltered task list (mirrors statusCounts above) so the badge
  // reflects the true queue size regardless of what's currently filtered.
  const needsReviewCount = useMemo(() => {
    if (!isLeadOrSupervisor) return 0;
    return liveTasks.filter(t =>
      (t.status === 'review' || t.status === 'lead-review') &&
      (!myDepartmentName || t.department === myDepartmentName)
    ).length;
  }, [liveTasks, isLeadOrSupervisor, myDepartmentName]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4 h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} tasks{needsReviewOnly ? ' (Needs My Review)' : myTasksOnly ? ' (My Tasks)' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isLeadOrSupervisor && (
            <Button
              variant={needsReviewOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNeedsReviewOnly(v => !v)}
              className={cn(
                'gap-1.5 touch-target hover-elevate active-elevate-2',
                needsReviewOnly
                  ? 'bg-accent-tally text-accent-tally-foreground border-accent-tally hover:bg-accent-tally/90'
                  : needsReviewCount > 0 && 'border-accent-tally/40 text-accent-tally hover:bg-accent-tally/10'
              )}
            >
              <UserCheck className="w-4 h-4" />
              Needs My Review
              {needsReviewCount > 0 && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'px-1.5 py-0 text-[10px] h-4',
                    needsReviewOnly
                      ? 'bg-black/10 text-accent-tally-foreground'
                      : 'bg-accent-tally/15 text-accent-tally'
                  )}
                >
                  {needsReviewCount}
                </Badge>
              )}
            </Button>
          )}
          {!isArtist && (
            <>
              <Button
                variant={myTasksOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMyTasksOnly(!myTasksOnly)}
                className="gap-1.5"
              >
                <ListTodo className="w-4 h-4" /> {myTasksOnly ? 'My Tasks' : 'All Tasks'}
              </Button>
              <div className="flex bg-muted/50 p-0.5 rounded-lg border border-border">
                <Button 
                  variant={view === 'list' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  onClick={() => setView('list')}
                  className="h-7 px-2.5 shadow-none"
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button 
                  variant={view === 'kanban' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  onClick={() => setView('kanban')}
                  className="h-7 px-2.5 shadow-none"
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
              <Button onClick={() => setCreateTaskModalOpen(true)} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md">
                Assign Task
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Status Pills */}
      <div className="flex gap-2 overflow-x-auto shrink-0 pb-1">
        {['all', 'not-started', 'in-progress', 'review', 'bottleneck', 'complete'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('-', ' ')} ({statusCounts[s] || 0})
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search tasks..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {['critical', 'high', 'medium', 'low'].map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {liveProjects.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Depts</SelectItem>
            {liveDepartments.map(d => (
              <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'kanban' ? (
          <KanbanView tasks={filtered} />
        ) : isMobile ? (
          <div className="rounded-md border border-border overflow-y-auto h-full p-3 space-y-3">
            {filtered.slice(0, 100).map(task => {
              const assignee = liveUsers.find(u => u.id === task.assigneeId);
              const project = liveProjects.find(p => p.id === task.projectId);
              return (
                <Card
                  key={task.id}
                  onClick={() => setActiveTaskDrawer(task.id)}
                  className="p-4 cursor-pointer touch-target hover-elevate active-elevate-2 border-border"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[15px] leading-snug">{task.title}</div>
                      <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[9px] uppercase">{task.department}</Badge>
                        {project && <span className="truncate">{project.name}</span>}
                      </div>
                    </div>
                    <StatusBadge status={task.status} className="shrink-0" />
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {assignee && (
                        <>
                          <UserAvatar userId={assignee.id} />
                          <span className="text-sm text-muted-foreground truncate">{assignee.name.split(' ')[0]}</span>
                        </>
                      )}
                    </div>
                    <PriorityChip priority={task.priority} className="shrink-0" />
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border/60">
                    <span className="text-xs text-muted-foreground timecode">{task.dueDate}</span>
                    {task.status === 'in-progress' && task.assigneeId === currentUser?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-[11px] bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20 touch-target"
                        onClick={(e) => handleSubmitForReview(e, task.id)}
                      >
                        <Play className="w-3 h-3 mr-1" /> Submit
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">
                <ListTodo className="w-10 h-10 mx-auto opacity-20 mb-3" />
                <p>No tasks match your filters.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-auto h-full">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted/80 backdrop-blur-sm text-muted-foreground">
                  <th className="h-10 px-4 text-left font-medium w-[40%]">Task / Context</th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-left font-medium">Priority</th>
                  <th className="h-10 px-4 text-left font-medium">Assignee</th>
                  <th className="h-10 px-4 text-left font-medium">Project</th>
                  <th className="h-10 px-4 text-left font-medium">Due Date</th>
                  <th className="h-10 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map(task => {
                  const assignee = liveUsers.find(u => u.id === task.assigneeId);
                  const project = liveProjects.find(p => p.id === task.projectId);
                  return (
                    <tr 
                      key={task.id} 
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setActiveTaskDrawer(task.id)}
                    >
                      <td className="p-4">
                        <div className="font-medium text-[15px]">{task.title}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] uppercase">{task.department}</Badge>
                          {task.shotId && <span className="text-indigo-400">Shot: {task.shotId}</span>}
                          {task.assetId && <span className="text-emerald-400">Asset: {task.assetId}</span>}
                        </div>
                      </td>
                      <td className="p-4"><StatusBadge status={task.status} /></td>
                      <td className="p-4"><PriorityChip priority={task.priority} /></td>
                      <td className="p-4">
                        {assignee && (
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={assignee.avatar} />
                              <AvatarFallback className="text-[10px]">{assignee.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground">{assignee.name.split(' ')[0]}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground text-xs">{project?.name}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">{task.dueDate}</td>
                      <td className="p-4 text-right">
                        {task.status === 'in-progress' && task.assigneeId === currentUser?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20 mr-2"
                            onClick={(e) => handleSubmitForReview(e, task.id)}
                          >
                            <Play className="w-3 h-3 mr-1" /> Submit
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">
                <ListTodo className="w-10 h-10 mx-auto opacity-20 mb-3" />
                <p>No tasks match your filters.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
