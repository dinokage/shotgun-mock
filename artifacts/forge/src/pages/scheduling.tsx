import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TASKS, USERS, PROJECTS } from '@/data/mockData';
import { Calendar, ChevronLeft, ChevronRight, Filter, Search, Settings, ZoomIn, ZoomOut, Download, Cpu } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useUIStore } from '@/store/ui';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

// Helper to add days to a date string (YYYY-MM-DD)
const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const getDaysDiff = (start: string, end: string) => {
  const diffTime = Math.abs(new Date(end).getTime() - new Date(start).getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
};

const VACATIONS = [
  { userId: 'u2', start: '2025-06-05', end: '2025-06-08' },
  { userId: 'u4', start: '2025-06-12', end: '2025-06-15' },
  { userId: 'u6', start: '2025-06-02', end: '2025-06-04' }
];

export default function Scheduling() {
  const { toast } = useToast();
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const { setActiveTaskDrawer } = useUIStore();

  // Generate a timeline window (e.g., today to today + 30 days)
  const today = new Date('2025-06-01'); // Using a fixed reference date based on our mock data
  const timelineDays = 45;
  
  const dates = Array.from({ length: timelineDays }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  const timelineStartStr = dates[0].toISOString().split('T')[0];
  const timelineEndStr = dates[dates.length - 1].toISOString().split('T')[0];

  // Process tasks to display
  const tasksToDisplay = useMemo(() => {
    return TASKS.filter(t => {
      if (projectFilter !== 'all' && t.projectId !== projectFilter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      // Must be within timeline window loosely
      return t.dueDate >= timelineStartStr;
    }).slice(0, 50).map(t => {
      // Mock a start date (since our mock data only has dueDate, let's say tasks take 3-10 days)
      const duration = Math.max(3, (t.id.charCodeAt(t.id.length - 1) % 10) + 1);
      const startDate = addDays(t.dueDate, -duration);
      
      const startOffset = getDaysDiff(timelineStartStr, startDate);
      const isBeforeStart = new Date(startDate) < new Date(timelineStartStr);
      
      return {
        ...t,
        startDate,
        duration,
        startOffset: isBeforeStart ? 0 : startOffset,
        visibleDuration: isBeforeStart ? duration - getDaysDiff(startDate, timelineStartStr) : duration,
      };
    });
  }, [projectFilter, search, timelineStartStr]);

  // Group by user
  const groupedByUser = useMemo(() => {
    const groups: Record<string, typeof tasksToDisplay> = {};
    USERS.forEach(u => groups[u.id] = []);
    tasksToDisplay.forEach(t => {
      if (groups[t.assigneeId]) groups[t.assigneeId].push(t);
    });
    // Remove empty groups
    return Object.fromEntries(Object.entries(groups).filter(([_, tasks]) => tasks.length > 0));
  }, [tasksToDisplay]);

  const cellWidth = 40 * zoom;

  // Calculate exact coordinates for every task to draw dependency lines
  const taskCoords = useMemo(() => {
    const coords: Record<string, { x: number, y: number, width: number, height: number }> = {};
    let currentY = 0;
    
    Object.keys(groupedByUser).forEach(userId => {
      const tasks = groupedByUser[userId];
      const rowHeight = Math.max(48, tasks.length * 40 + 8);
      
      tasks.forEach((task, i) => {
        const left = task.startOffset * cellWidth;
        const width = Math.max(task.visibleDuration * cellWidth - 4, 10);
        const top = currentY + 8 + (i * 40);
        coords[task.id] = { x: left, y: top, width, height: 28 };
      });
      
      currentY += rowHeight;
    });
    
    return coords;
  }, [groupedByUser, cellWidth]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-20">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduling & Timeline</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => toast({ title: "AI Reassignment Triggered", description: "Rebalancing tasks from lagging teams to available artists..." })} className="border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10">
            <Cpu className="w-4 h-4 mr-2" /> Auto-Resolve Bottlenecks
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
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
                  <Button variant="outline">Cancel</Button>
                  <Button onClick={() => toast({ title: 'Import Started', description: 'Background job queued to import 124 shots.' })}>Start Import</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search tasks..." className="pl-9 h-9 w-64" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="All Projects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {PROJECTS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border rounded-md">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-r border-border" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={() => setZoom(Math.min(2, zoom + 0.25))}><ZoomIn className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      {/* Resource Utilization Panel */}
      <div className="border-b border-border bg-card/50 px-6 py-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team Utilization Overview</h3>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Available (&lt;75%)</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500" /> Near Capacity (75-90%)</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /> Over-allocated (&gt;90%)</div>
          </div>
        </div>
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
          {USERS.filter(u => u.role !== 'client').slice(0, 8).map(user => {
            const cap = user.capacity ?? 50;
            const barColor = cap > 90 ? 'bg-red-500' : cap > 75 ? 'bg-yellow-500' : 'bg-emerald-500';
            const ringColor = cap > 90 ? 'ring-red-500/30' : cap > 75 ? 'ring-yellow-500/30' : 'ring-emerald-500/30';
            const totalHours = Math.round(cap * 0.4);
            return (
              <div key={user.id} className={`bg-card border border-border rounded-lg p-3 ring-1 ${ringColor} hover:ring-2 transition-all cursor-pointer`}>
                <div className="flex items-center gap-2 mb-2">
                  <Avatar className="w-5 h-5"><AvatarImage src={user.avatar} /><AvatarFallback>{user.name.charAt(0)}</AvatarFallback></Avatar>
                  <span className="text-xs font-medium truncate">{user.name.split(' ')[0]}</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-1">
                  <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${Math.min(cap, 100)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono font-bold">{cap}%</span>
                  <span>{totalHours}h / 40h</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Team Average: <strong className="text-foreground">{Math.round(USERS.filter(u => u.role !== 'client').slice(0, 8).reduce((s, u) => s + (u.capacity ?? 50), 0) / 8)}%</strong></span>
          <span className="text-[10px]">{USERS.filter(u => (u.capacity ?? 50) > 90).length} over-allocated · {USERS.filter(u => (u.capacity ?? 50) < 50).length} available for rebalancing</span>
        </div>
      </div>

      {/* Gantt Chart Area */}
      <div className="flex-1 flex overflow-hidden bg-background">
        {/* Left pane: Resources (Users) */}
        <div className="w-64 shrink-0 border-r border-border bg-card flex flex-col z-10 shadow-sm relative">
          <div className="h-12 border-b border-border flex items-center px-4 font-semibold text-sm bg-muted/30">
            Resources
          </div>
          <div className="flex-1 overflow-y-auto">
            {Object.keys(groupedByUser).map(userId => {
              const user = USERS.find(u => u.id === userId);
              const tasks = groupedByUser[userId];
              return (
                <div key={userId} className="border-b border-border" style={{ height: `${Math.max(48, tasks.length * 40 + 8)}px` }}>
                  <div className="flex items-center gap-3 p-3 absolute left-0 w-64 bg-card/80 backdrop-blur-sm pointer-events-none">
                    <Avatar className="w-6 h-6"><AvatarImage src={user?.avatar} /><AvatarFallback>{user?.name.charAt(0)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="text-sm font-medium truncate pointer-events-auto leading-tight">{user?.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate leading-tight flex items-center justify-between mt-1">
                        <span>{user?.role}</span>
                        {user && (
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${user.capacity > 90 ? 'bg-red-500' : user.capacity > 75 ? 'bg-yellow-500' : 'bg-green-500'}`} 
                                style={{ width: `${Math.min(user.capacity, 100)}%` }}
                              />
                            </div>
                            <span className="text-[9px] font-mono">{user.capacity}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right pane: Timeline */}
        <div className="flex-1 overflow-auto relative custom-scrollbar">
          {/* Timeline Header (Dates) */}
          <div className="h-12 border-b border-border flex sticky top-0 bg-card/95 backdrop-blur z-20 w-max">
            {dates.map((date, i) => {
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const isToday = i === 0;
              return (
                <div key={i} className={`flex flex-col items-center justify-center border-r border-border ${isWeekend ? 'bg-muted/30' : ''} ${isToday ? 'bg-primary/10 text-primary' : ''}`} style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}>
                  <span className="text-[10px] uppercase font-semibold">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <span className="text-xs">{date.getDate()}</span>
                </div>
              );
            })}
          </div>

          {/* Timeline Body (Gantt Bars) */}
          <div className="relative w-max" style={{ width: `${dates.length * cellWidth}px` }}>
            {/* Grid lines */}
            <div className="absolute inset-0 flex pointer-events-none z-10">
              {dates.map((date, i) => {
                const isToday = i === 0;
                return (
                  <div key={i} className={`relative h-full border-r border-border/50 ${date.getDay() === 0 || date.getDay() === 6 ? 'bg-muted/10' : ''}`} style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}>
                    {isToday && (
                      <div className="absolute top-0 bottom-0 w-0.5 bg-primary/70 left-1/2 -translate-x-1/2 z-20">
                        <div className="absolute top-0 w-2.5 h-2.5 bg-primary rounded-full -translate-x-1/2 left-1/2 -mt-1.5 shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-pulse" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Dependency Lines */}
            <svg className="absolute inset-0 pointer-events-none z-10 w-full h-full" style={{ minHeight: '100%' }}>
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 0, 6 3, 0 6" fill="rgba(156, 163, 175, 0.6)" />
                </marker>
              </defs>
              {tasksToDisplay.flatMap(task => 
                (task.dependencies || []).map(dep => {
                  const start = taskCoords[dep.taskId]; // The task we depend on (parent)
                  const end = taskCoords[task.id]; // This task (child)
                  
                  if (!start || !end) return null; // Dependency might be out of current view
                  
                  // Calculate control points for a smooth bezier curve
                  const startX = start.x + start.width;
                  const startY = start.y + (start.height / 2);
                  const endX = end.x;
                  const endY = end.y + (end.height / 2);
                  
                  // Make the curve stronger if tasks are far apart horizontally
                  const cpOffset = Math.max(20, Math.abs(endX - startX) * 0.5);
                  
                  const d = `M ${startX} ${startY} C ${startX + cpOffset} ${startY}, ${endX - cpOffset} ${endY}, ${endX - 2} ${endY}`;
                  
                  return (
                    <path 
                      key={`dep-${dep.taskId}-${task.id}`}
                      d={d}
                      fill="none"
                      stroke="rgba(156, 163, 175, 0.4)"
                      strokeWidth="2"
                      markerEnd="url(#arrowhead)"
                      className="transition-all duration-300"
                    />
                  );
                })
              )}
            </svg>

            {/* Task Rows */}
            {Object.keys(groupedByUser).map(userId => {
              const tasks = groupedByUser[userId];
              const rowHeight = Math.max(48, tasks.length * 40 + 8);
              return (
                <div key={userId} className="relative border-b border-border hover:bg-muted/5 group transition-colors" style={{ height: `${rowHeight}px` }}>
                  
                  {/* Vacation Blocks */}
                  {VACATIONS.filter(v => v.userId === userId).map((vacation, vIdx) => {
                    const startOffset = Math.max(0, getDaysDiff(timelineStartStr, vacation.start));
                    const isBeforeStart = new Date(vacation.start) < new Date(timelineStartStr);
                    const actualStartOffset = isBeforeStart ? 0 : startOffset;
                    
                    const duration = getDaysDiff(vacation.start, vacation.end) + 1;
                    const width = duration * cellWidth;
                    const left = actualStartOffset * cellWidth;
                    
                    return (
                      <div 
                        key={`vacation-${userId}-${vIdx}`}
                        className="absolute z-20 flex items-center justify-center opacity-80 overflow-hidden pointer-events-none"
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          top: '4px',
                          bottom: '4px',
                          background: 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.05), rgba(239, 68, 68, 0.05) 10px, rgba(239, 68, 68, 0.15) 10px, rgba(239, 68, 68, 0.15) 20px)',
                          borderLeft: '2px solid rgba(239, 68, 68, 0.4)',
                          borderRight: '2px solid rgba(239, 68, 68, 0.4)',
                          borderRadius: '4px'
                        }}
                      >
                        <span className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest bg-background/50 px-1 py-0.5 rounded backdrop-blur-sm">PTO</span>
                      </div>
                    )
                  })}

                  {tasks.map((task, i) => {
                    const project = PROJECTS.find(p => p.id === task.projectId);
                    const left = task.startOffset * cellWidth;
                    const width = task.visibleDuration * cellWidth;
                    const top = 8 + (i * 40);
                    const isComplete = task.status === 'approved';
                    
                    let bg = 'bg-blue-500/80';
                    if (task.status === 'bottleneck') bg = 'bg-red-500/80';
                    if (task.priority === 'critical') bg = 'bg-orange-500/80';
                    if (isComplete) bg = 'bg-green-500/80';

                    return (
                      <DraggableBar
                        key={task.id}
                        task={task}
                        left={left}
                        width={width}
                        top={top}
                        bg={bg}
                        isComplete={isComplete}
                        project={project}
                        onClick={() => setActiveTaskDrawer(task.id)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DraggableBar({ task, left, width, top, bg, isComplete, project, onClick }: any) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    const startX = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setDragOffset(deltaX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // In a real app, we would snap to grid and update the task dates in the store here
      // For now, just visually drop it
      setDragOffset(0);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`absolute rounded-md shadow-sm border border-black/10 overflow-hidden cursor-move transition-transform ${isDragging ? 'shadow-lg z-50 ring-2 ring-primary' : 'hover:-translate-y-0.5 hover:shadow-md'} ${bg} ${isComplete ? 'opacity-60' : ''}`}
      style={{ 
        left: `${left}px`, 
        width: `${Math.max(width - 4, 10)}px`, 
        top: `${top}px`, 
        height: '28px',
        transform: dragOffset !== 0 ? `translateX(${dragOffset}px)` : undefined,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onClick={dragOffset === 0 ? onClick : undefined}
      onMouseDown={handleMouseDown}
    >
      <div className="px-2 py-1 text-[10px] text-white font-medium truncate flex items-center justify-between h-full pointer-events-none">
        <span className="truncate">{task.title}</span>
        {width > 120 && <span className="opacity-80 shrink-0 ml-2">{project?.name}</span>}
      </div>
    </div>
  );
}
