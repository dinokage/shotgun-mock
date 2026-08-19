import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS, PROJECTS, LEAVE_EVENTS, DEPENDENCY_TYPE_LABELS } from '@/data/mockData';
import { Search, ZoomIn, ZoomOut } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useTasksStore } from '@/store/tasks';
import { useToast } from '@/hooks/use-toast';
import { addDays, getDaysDiff, getTaskWindow, REFERENCE_DATE, TIMELINE_DAYS } from './utils';

const LEAVE_LABEL: Record<string, string> = { vacation: 'PTO', sick: 'SICK', holiday: 'HOL' };

// utils.getDaysDiff floors zero-length ranges up to 1 (so a same-day
// *duration* never renders as a zero-width bar), which is wrong whenever the
// same value is read as a day *offset* or as an inclusive same-day span —
// an offset of exactly 0 (something starting on the timeline's first day)
// and a single-day leave/task both legitimately hit that zero-length case.
// Use an un-floored day count for those instead of getDaysDiff.
const dayOffset = (from: string, to: string) =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));

export default function TeamCalendar() {
  const { toast } = useToast();
  const { setActiveTaskDrawer } = useUIStore();
  const tasks = useTasksStore((s) => s.tasks);
  const updateTaskDates = useTasksStore((s) => s.updateTaskDates);

  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);

  const dates = useMemo(
    () => Array.from({ length: TIMELINE_DAYS }).map((_, i) => {
      const d = new Date(REFERENCE_DATE);
      d.setDate(d.getDate() + i);
      return d;
    }),
    []
  );

  const timelineStartStr = dates[0].toISOString().split('T')[0];
  const timelineEndStr = dates[dates.length - 1].toISOString().split('T')[0];

  const tasksToDisplay = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.assigneeId) return false;
      if (projectFilter !== 'all' && t.projectId !== projectFilter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return t.dueDate >= timelineStartStr;
    }).slice(0, 50).map((t) => {
      const { startDate, duration } = getTaskWindow(t);
      const startOffset = dayOffset(timelineStartStr, startDate);
      const isBeforeStart = startOffset < 0;

      return {
        ...t,
        startDate,
        duration,
        startOffset: isBeforeStart ? 0 : startOffset,
        visibleDuration: isBeforeStart ? duration - getDaysDiff(startDate, timelineStartStr) : duration,
      };
    });
  }, [tasks, projectFilter, search, timelineStartStr]);

  const groupedByUser = useMemo(() => {
    const groups: Record<string, typeof tasksToDisplay> = {};
    USERS.forEach((u) => (groups[u.id] = []));
    tasksToDisplay.forEach((t) => {
      if (groups[t.assigneeId]) groups[t.assigneeId].push(t);
    });
    return Object.fromEntries(Object.entries(groups).filter(([, ts]) => ts.length > 0));
  }, [tasksToDisplay]);

  const cellWidth = 40 * zoom;

  const taskCoords = useMemo(() => {
    const coords: Record<string, { x: number; y: number; width: number; height: number }> = {};
    let currentY = 0;
    Object.keys(groupedByUser).forEach((userId) => {
      const rows = groupedByUser[userId];
      const rowHeight = Math.max(48, rows.length * 40 + 8);
      rows.forEach((task, i) => {
        const left = task.startOffset * cellWidth;
        const width = Math.max(task.visibleDuration * cellWidth - 4, 10);
        const top = currentY + 8 + i * 40;
        coords[task.id] = { x: left, y: top, width, height: 28 };
      });
      currentY += rowHeight;
    });
    return coords;
  }, [groupedByUser, cellWidth]);

  // The dependency-arrow SVG defaults to overflow:hidden, so its own box has
  // to actually reach any endpoint a path draws to. Task bars aren't clamped
  // on their right edge (only the left edge is clamped to the visible
  // start), so a dependency between two far-apart tasks can need more width
  // than the nominal `dates.length * cellWidth` timeline — widen the SVG's
  // box to cover that instead of letting the browser clip the path away.
  const timelineWidth = dates.length * cellWidth;
  const dependencyBoundsWidth = useMemo(() => {
    let max = timelineWidth;
    tasksToDisplay.forEach((task) => {
      (task.dependencies || []).forEach((dep) => {
        const start = taskCoords[dep.taskId];
        const end = taskCoords[task.id];
        if (!start || !end) return;
        max = Math.max(max, start.x + start.width, end.x + end.width);
      });
    });
    return max;
  }, [tasksToDisplay, taskCoords, timelineWidth]);

  const handleReschedule = (taskId: string, dayDelta: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newDueDate = addDays(task.dueDate, dayDelta);
    updateTaskDates(taskId, newDueDate);
    toast({
      title: 'Task rescheduled',
      description: `${task.title} moved to ${new Date(newDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-border bg-card/50 px-6 py-3 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Per-Person Time Allocation</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Drag a bar to reschedule &middot; dashed blocks are leave / PTO</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search tasks..." className="pl-9 h-9 w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="All Projects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {PROJECTS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border rounded-md">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-r border-border" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={() => setZoom(Math.min(2, zoom + 0.25))}><ZoomIn className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      {/* Calendar Area */}
      <div className="flex-1 flex overflow-hidden bg-background">
        <div className="w-64 shrink-0 border-r border-border bg-card flex flex-col z-10 shadow-sm relative">
          <div className="h-12 border-b border-border flex items-center px-4 font-semibold text-sm bg-muted/30">People</div>
          <div className="flex-1 overflow-y-auto">
            {Object.keys(groupedByUser).map((userId) => {
              const user = USERS.find((u) => u.id === userId);
              const rows = groupedByUser[userId];
              return (
                <div key={userId} className="border-b border-border" style={{ height: `${Math.max(48, rows.length * 40 + 8)}px` }}>
                  <div className="flex items-center gap-3 p-3 absolute left-0 w-64 bg-card/80 backdrop-blur-sm pointer-events-none">
                    <Avatar className="w-6 h-6"><AvatarImage src={user?.avatar} /><AvatarFallback>{user?.name.charAt(0)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="text-sm font-medium truncate pointer-events-auto leading-tight">{user?.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate leading-tight flex items-center justify-between mt-1">
                        <span>{user?.role}</span>
                        {user && (
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <motion.div
                                className={`h-full ${user.capacity > 90 ? 'bg-red-500' : user.capacity > 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(user.capacity, 100)}%` }}
                                transition={{ duration: 0.7, ease: 'easeOut' }}
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
            {Object.keys(groupedByUser).length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">No scheduled tasks match your filters.</div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto relative custom-scrollbar">
          <div className="h-12 border-b border-border flex sticky top-0 bg-card/95 backdrop-blur z-20 w-max">
            {dates.map((date, i) => {
              const weekend = date.getDay() === 0 || date.getDay() === 6;
              const isToday = i === 0;
              // At the lowest zoom (20px columns) the 3-letter abbreviation no
              // longer fits and runs into its neighbors — fall back to a
              // single-letter weekday label so it stays legible.
              const weekdayLabel = zoom <= 0.5
                ? date.toLocaleDateString('en-US', { weekday: 'narrow' })
                : date.toLocaleDateString('en-US', { weekday: 'short' });
              return (
                <div key={i} className={`flex flex-col items-center justify-center border-r border-border ${weekend ? 'bg-muted/30' : ''} ${isToday ? 'bg-primary/10 text-primary' : ''}`} style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}>
                  <span className="text-[10px] uppercase font-semibold">{weekdayLabel}</span>
                  <span className="text-xs">{date.getDate()}</span>
                </div>
              );
            })}
          </div>

          <div className="relative w-max" style={{ width: `${dates.length * cellWidth}px` }}>
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

            <svg className="absolute top-0 left-0 pointer-events-none z-10 h-full" style={{ width: `${dependencyBoundsWidth}px`, minHeight: '100%' }}>
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 0, 6 3, 0 6" fill="rgba(156, 163, 175, 0.6)" />
                </marker>
              </defs>
              {tasksToDisplay.flatMap((task) =>
                (task.dependencies || []).map((dep) => {
                  const start = taskCoords[dep.taskId];
                  const end = taskCoords[task.id];
                  if (!start || !end) return null;
                  const startX = start.x + start.width;
                  const startY = start.y + start.height / 2;
                  const endX = end.x;
                  const endY = end.y + end.height / 2;
                  const cpOffset = Math.max(20, Math.abs(endX - startX) * 0.5);
                  const d = `M ${startX} ${startY} C ${startX + cpOffset} ${startY}, ${endX - cpOffset} ${endY}, ${endX - 2} ${endY}`;
                  return (
                    <path key={`dep-${dep.taskId}-${task.id}`} d={d} fill="none" stroke="rgba(156, 163, 175, 0.4)" strokeWidth="2" markerEnd="url(#arrowhead)" className="transition-all duration-300" />
                  );
                })
              )}
            </svg>

            {/* Dependency link-type badges (FS/SS/FF/SF + lag), overlaid on the same coordinate space as the arrows */}
            <div className="absolute inset-0 pointer-events-none z-10">
              {tasksToDisplay.flatMap((task) =>
                (task.dependencies || []).map((dep) => {
                  const start = taskCoords[dep.taskId];
                  const end = taskCoords[task.id];
                  if (!start || !end) return null;
                  const midX = (start.x + start.width + end.x) / 2;
                  const midY = (start.y + start.height / 2 + end.y + end.height / 2) / 2;
                  return (
                    <div
                      key={`dep-badge-${dep.taskId}-${task.id}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2 px-1 py-0.5 rounded text-[8px] font-mono font-semibold bg-card border border-border text-muted-foreground shadow-sm whitespace-nowrap"
                      style={{ left: midX, top: midY }}
                      title={DEPENDENCY_TYPE_LABELS[dep.type]}
                    >
                      {dep.type}{dep.lagDays ? ` +${dep.lagDays}d` : ''}
                    </div>
                  );
                })
              )}
            </div>

            {Object.keys(groupedByUser).map((userId) => {
              const rows = groupedByUser[userId];
              const rowHeight = Math.max(48, rows.length * 40 + 8);
              const userLeave = LEAVE_EVENTS.filter((v) => v.userId === userId && v.start <= timelineEndStr && v.end >= timelineStartStr);
              return (
                <div key={userId} className="relative border-b border-border hover:bg-muted/5 group transition-colors" style={{ height: `${rowHeight}px` }}>
                  {userLeave.map((leave) => {
                    const leaveOffset = dayOffset(timelineStartStr, leave.start);
                    const isBeforeStart = leaveOffset < 0;
                    const startOffset = isBeforeStart ? 0 : leaveOffset;
                    const duration = dayOffset(leave.start, leave.end) + 1;
                    const width = duration * cellWidth;
                    const left = startOffset * cellWidth;
                    return (
                      <motion.div
                        key={leave.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.8 }}
                        transition={{ duration: 0.4 }}
                        className="absolute z-20 flex items-center justify-center overflow-hidden pointer-events-none"
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          top: '4px',
                          bottom: '4px',
                          background: 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.05), rgba(239, 68, 68, 0.05) 10px, rgba(239, 68, 68, 0.15) 10px, rgba(239, 68, 68, 0.15) 20px)',
                          borderLeft: '2px solid rgba(239, 68, 68, 0.4)',
                          borderRight: '2px solid rgba(239, 68, 68, 0.4)',
                          borderRadius: '4px',
                        }}
                        title={leave.reason}
                      >
                        <span className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest bg-background/50 px-1 py-0.5 rounded backdrop-blur-sm">{LEAVE_LABEL[leave.type]}</span>
                      </motion.div>
                    );
                  })}

                  {rows.map((task, i) => {
                    const project = PROJECTS.find((p) => p.id === task.projectId);
                    const left = task.startOffset * cellWidth;
                    const width = task.visibleDuration * cellWidth;
                    const top = 8 + i * 40;
                    const isComplete = task.status === 'approved' || task.status === 'complete';

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
                        cellWidth={cellWidth}
                        onClick={() => setActiveTaskDrawer(task.id)}
                        onReschedule={(dayDelta) => handleReschedule(task.id, dayDelta)}
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

function DraggableBar({
  task, left, width, top, bg, isComplete, project, cellWidth, onClick, onReschedule,
}: {
  task: { title: string };
  left: number; width: number; top: number; bg: string; isComplete: boolean;
  project?: { name: string };
  cellWidth: number;
  onClick: () => void;
  onReschedule: (dayDelta: number) => void;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // handleMouseUp resets dragOffset to 0 synchronously, before the browser's
  // native click event fires on the same element (mouseup -> click, same
  // tick) — so an `onClick={dragOffset === 0 ? onClick : undefined}` guard
  // can never actually see a nonzero offset and always lets the click
  // through. Track "a real drag just happened" in a ref instead, which
  // survives past the mouseup handler into the click handler right after it.
  const suppressClickRef = useRef(false);
  const CLICK_SUPPRESS_THRESHOLD_PX = 4;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    suppressClickRef.current = false;
    const startX = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setDragOffset(moveEvent.clientX - startX);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const deltaX = upEvent.clientX - startX;
      const dayDelta = Math.round(deltaX / cellWidth);
      setIsDragging(false);
      setDragOffset(0);
      if (Math.abs(deltaX) > CLICK_SUPPRESS_THRESHOLD_PX) {
        suppressClickRef.current = true;
      }
      if (dayDelta !== 0) onReschedule(dayDelta);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      // Consume the flag so the *next* genuine click (without a drag) still
      // opens the drawer normally.
      suppressClickRef.current = false;
      return;
    }
    onClick();
  };

  return (
    <motion.div
      layout={!isDragging}
      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
      className={`absolute rounded-md shadow-sm border border-black/10 overflow-hidden ${isDragging ? 'shadow-lg z-50 ring-2 ring-primary' : ''} ${bg} ${isComplete ? 'opacity-60' : ''}`}
      style={{
        left: `${left}px`,
        width: `${Math.max(width - 4, 10)}px`,
        top: `${top}px`,
        height: '28px',
        x: dragOffset,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      whileHover={!isDragging ? { y: -2, boxShadow: '0 6px 16px rgba(0,0,0,0.3)' } : undefined}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      <div className="px-2 py-1 text-[10px] text-white font-medium truncate flex items-center justify-between h-full pointer-events-none">
        <span className="truncate">{task.title}</span>
        {width > 120 && <span className="opacity-80 shrink-0 ml-2">{project?.name}</span>}
      </div>
    </motion.div>
  );
}
