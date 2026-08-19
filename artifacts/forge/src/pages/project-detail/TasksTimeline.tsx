import { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTasksStore } from '@/store/tasks';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { DEPENDENCY_TYPE_LABELS, MILESTONES } from '@/data/mockData';

const PIXELS_PER_DAY = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_PADDING_DAYS = 5;
const MIN_WINDOW_DAYS = 30;

export default function TasksTimelineView({ projectId }: { projectId: string }) {
  const { tasks, updateTaskDates } = useTasksStore();
  const projectTasks = tasks.filter(t => t.projectId === projectId);
  const projectMilestones = MILESTONES.filter(m => m.projectId === projectId);
  const containerRef = useRef<HTMLDivElement>(null);

  const [draggingTask, setDraggingTask] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [originalDateTs, setOriginalDateTs] = useState(0);

  // Derive the visible Gantt window from the real min/max task dates instead of a
  // hardcoded range, so bars for whatever year the seeded data lives in still render.
  const { startDate, totalDays } = useMemo(() => {
    const now = Date.now();
    if (projectTasks.length === 0) {
      return { startDate: now - WINDOW_PADDING_DAYS * MS_PER_DAY, totalDays: MIN_WINDOW_DAYS };
    }
    let minStart = Infinity;
    let maxEnd = -Infinity;
    projectTasks.forEach(task => {
      const due = new Date(task.dueDate).getTime();
      const durationDays = Math.max(1, task.estimatedHours / 8);
      const start = due - durationDays * MS_PER_DAY;
      if (start < minStart) minStart = start;
      if (due > maxEnd) maxEnd = due;
    });
    projectMilestones.forEach(m => {
      const due = new Date(m.dueDate).getTime();
      if (due < minStart) minStart = due;
      if (due > maxEnd) maxEnd = due;
    });
    const paddedStart = minStart - WINDOW_PADDING_DAYS * MS_PER_DAY;
    const paddedEnd = maxEnd + WINDOW_PADDING_DAYS * MS_PER_DAY;
    const spanDays = Math.ceil((paddedEnd - paddedStart) / MS_PER_DAY);
    return { startDate: paddedStart, totalDays: Math.max(MIN_WINDOW_DAYS, spanDays) };
  }, [projectTasks, projectMilestones]);

  const getDaysFromStart = (dateStr: string) => {
    return (new Date(dateStr).getTime() - startDate) / MS_PER_DAY;
  };

  const handleMouseDown = (e: React.MouseEvent, id: string, currentDate: string) => {
    setDraggingTask(id);
    setStartX(e.clientX);
    // Anchor to the task's own absolute date, not its pixel offset against the
    // derived window. The window (startDate/totalDays) is itself recomputed from
    // every task's date via useMemo, so anchoring through it here would create a
    // feedback loop: moving the earliest/latest task shifts the window, which
    // shifts the computed date, which shifts the window again on the next
    // mousemove — causing runaway/erratic jumps instead of tracking the cursor.
    setOriginalDateTs(new Date(currentDate).getTime());
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingTask) return;
      const dx = e.clientX - startX;
      const dayDelta = Math.round(dx / PIXELS_PER_DAY);

      const newDate = new Date(originalDateTs + dayDelta * MS_PER_DAY);
      updateTaskDates(draggingTask, newDate.toISOString().split('T')[0]);
    };

    const handleMouseUp = () => {
      setDraggingTask(null);
    };

    if (draggingTask) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingTask, startX, originalDateTs, updateTaskDates]);

  // Coordinates of each task's bar (in the same space as the bars themselves) so we can draw
  // dependency arrows/badges between them.
  const taskBarCoords: Record<string, { left: number; right: number; y: number }> = {};
  projectTasks.forEach((task, index) => {
    const right = getDaysFromStart(task.dueDate) * PIXELS_PER_DAY;
    const width = Math.max(PIXELS_PER_DAY, (task.estimatedHours / 8) * PIXELS_PER_DAY);
    taskBarCoords[task.id] = { left: right - width, right, y: index * 48 + 24 };
  });

  const todayStr = new Date().toISOString().split('T')[0];

  // Generate headers spanning the derived window
  const days = Array.from({ length: totalDays }).map((_, i) => {
    const d = new Date(startDate + i * MS_PER_DAY);
    return {
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isToday: d.toISOString().split('T')[0] === todayStr
    };
  });

  const todayDaysFromStart = getDaysFromStart(todayStr);
  const isTodayInWindow = todayDaysFromStart >= 0 && todayDaysFromStart < totalDays;

  return (
    <div className="h-full flex flex-col relative select-none">
      <div className="flex bg-card border-b border-border sticky top-0 z-20">
        <div className="w-64 shrink-0 border-r border-border p-3 font-medium text-sm bg-muted/30">Task</div>
        <div className="flex-1 flex overflow-hidden">
          {days.map((day, i) => (
            <div key={i} className={`shrink-0 w-[30px] border-r border-border text-center text-[10px] text-muted-foreground pt-4 ${day.isToday ? 'bg-primary/10 text-primary font-bold' : ''}`}>
              {day.label.split(' ')[1]}
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto flex" ref={containerRef}>
        <div className="w-64 shrink-0 border-r border-border bg-card z-10 sticky left-0">
          {projectTasks.map(task => (
            <div key={task.id} className="h-12 border-b border-border flex items-center px-3 gap-2">
              <UserAvatar userId={task.assigneeId} />
              <div className="text-sm truncate" title={task.title}>{task.title}</div>
            </div>
          ))}
        </div>
        
        <div className="flex-1 relative" style={{ width: days.length * PIXELS_PER_DAY }}>
          {/* Grid lines */}
          <div className="absolute inset-0 flex pointer-events-none z-0">
            {days.map((day, i) => (
              <div key={i} className={`shrink-0 w-[30px] border-r border-border/50 h-full ${day.isToday ? 'bg-primary/5' : ''}`} />
            ))}
          </div>
          
          {/* Dependency arrows */}
          <svg className="absolute inset-0 pointer-events-none z-[15]" style={{ width: days.length * PIXELS_PER_DAY, height: projectTasks.length * 48 }}>
            <defs>
              <marker id="timeline-arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <polygon points="0 0, 6 3, 0 6" fill="rgba(156, 163, 175, 0.6)" />
              </marker>
            </defs>
            {projectTasks.flatMap(task =>
              (task.dependencies || []).map(dep => {
                const start = taskBarCoords[dep.taskId];
                const end = taskBarCoords[task.id];
                if (!start || !end) return null;
                const cpOffset = Math.max(20, Math.abs(end.left - start.right) * 0.5);
                const d = `M ${start.right} ${start.y} C ${start.right + cpOffset} ${start.y}, ${end.left - cpOffset} ${end.y}, ${end.left - 2} ${end.y}`;
                return (
                  <path
                    key={`dep-${dep.taskId}-${task.id}`}
                    d={d}
                    fill="none"
                    stroke="rgba(156, 163, 175, 0.45)"
                    strokeWidth="2"
                    markerEnd="url(#timeline-arrowhead)"
                    className="transition-all duration-300"
                  />
                );
              })
            )}
          </svg>

          {/* Dependency link-type badges */}
          <div className="absolute inset-0 pointer-events-none z-[15]">
            {projectTasks.flatMap(task =>
              (task.dependencies || []).map(dep => {
                const start = taskBarCoords[dep.taskId];
                const end = taskBarCoords[task.id];
                if (!start || !end) return null;
                const midX = (start.right + end.left) / 2;
                const midY = (start.y + end.y) / 2;
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

          {/* Milestones (real per-project milestones, not hardcoded placeholder dates) */}
          {projectMilestones.map(milestone => {
            const daysFromStart = getDaysFromStart(milestone.dueDate);
            if (daysFromStart < 0 || daysFromStart >= days.length) return null;
            const left = daysFromStart * PIXELS_PER_DAY + (PIXELS_PER_DAY / 2); // Center on day
            const color = milestone.status === 'complete' ? 'bg-emerald-500'
              : milestone.status === 'at-risk' ? 'bg-amber-500'
              : milestone.status === 'overdue' ? 'bg-red-500'
              : 'bg-blue-500';
            return (
              <div key={milestone.id} className="absolute top-0 bottom-0 z-10 pointer-events-none flex flex-col items-center" style={{ left }}>
                {/* Milestone Label */}
                <div className={`px-2 py-0.5 mt-2 rounded text-[9px] font-bold text-white shadow-sm whitespace-nowrap ${color}`}>
                  {milestone.name}
                </div>
                {/* Milestone Line */}
                <div className={`w-px flex-1 mt-1 opacity-50 border-l-2 border-dashed ${color.replace('bg-', 'border-')}`} />
              </div>
            );
          })}

          {/* Today line */}
          {isTodayInWindow && (
            <div className="absolute top-0 bottom-0 w-px bg-primary z-10 pointer-events-none" style={{ left: todayDaysFromStart * PIXELS_PER_DAY + PIXELS_PER_DAY / 2 }}>
              <div className="absolute top-0 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
            </div>
          )}

          {/* Task bars */}
          {projectTasks.map((task, index) => {
            const left = getDaysFromStart(task.dueDate) * PIXELS_PER_DAY;
            // Fake duration based on estimated hours
            const width = Math.max(PIXELS_PER_DAY, (task.estimatedHours / 8) * PIXELS_PER_DAY);
            const isCritical = task.priority === 'critical';
            
            return (
              <div key={task.id} className="absolute h-12 flex items-center z-20" style={{ top: index * 48, left: 0, right: 0 }}>
                <motion.div
                  className={`h-7 rounded-sm border cursor-ew-resize flex items-center px-2 text-xs font-medium text-white overflow-hidden ${isCritical ? 'bg-[#A03030] border-[#A03030]' : 'bg-primary border-primary-foreground/20'}`}
                  style={{
                    marginLeft: left - width,
                    width,
                    zIndex: draggingTask === task.id ? 30 : 20
                  }}
                  animate={{
                    opacity: draggingTask === task.id ? 0.85 : 1,
                    scale: draggingTask === task.id ? 1.04 : 1,
                    boxShadow: draggingTask === task.id
                      ? '0 8px 20px rgba(0,0,0,0.35)'
                      : '0 1px 2px rgba(0,0,0,0.15)',
                  }}
                  whileHover={{ y: draggingTask === task.id ? 0 : -2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                  onMouseDown={(e) => handleMouseDown(e, task.id, task.dueDate)}
                >
                  <span className="truncate">{task.estimatedHours}h - {task.title}</span>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
