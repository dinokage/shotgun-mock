import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS, PROJECTS, DEPARTMENTS } from '@/data/mockData';
import { useTasksStore } from '@/store/tasks';
import { Search, ListTodo, LayoutGrid, List, Calendar, Filter, CheckCircle2, Clock, AlertTriangle, Circle, Play } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PriorityChip } from '@/components/shared/PriorityChip';
import { useUIStore } from '@/store/ui';
import KanbanView from './project-detail/TasksKanban';
import { apiClient } from '@/lib/apiClient';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

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
  const [view, setView] = useState<ViewMode>('list');
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const liveTasks = useTasksStore(state => state.tasks);
  const submitForReview = useTasksStore(state => state.submitForReview);
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
  
  // RBAC Setup
  const isArtist = currentUser ? ['senior_artist', 'artist', 'junior_artist'].includes(currentUser.role) : true;
  // If artist, strictly force myTasksOnly to true
  const forceMyTasksOnly = isArtist;
  const effectiveMyTasksOnly = forceMyTasksOnly || myTasksOnly;

  const currentUserId = currentUser?.id || liveUsers[0]?.id || 'u1';

  const filtered = useMemo(() => {
    return liveTasks.filter(t => {
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
  }, [search, statusFilter, priorityFilter, projectFilter, departmentFilter, myTasksOnly, forceMyTasksOnly, currentUserId, liveTasks]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: liveTasks.length };
    liveTasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return counts;
  }, [liveTasks]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4 h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} tasks{myTasksOnly ? ' (My Tasks)' : ''}</p>
        </div>
        <div className="flex gap-2">
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
                            onClick={(e) => {
                              e.stopPropagation();
                              submitForReview(task.id);
                            }}
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
