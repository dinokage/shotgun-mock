import { useState, useRef, useEffect } from 'react';
import { useTasksStore } from '@/store/tasks';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { USERS } from '@/data/mockData';

const PIXELS_PER_DAY = 30;
const START_DATE = new Date('2024-09-15').getTime();

export default function TasksTimelineView({ projectId }: { projectId: string }) {
  const { tasks, updateTaskDates } = useTasksStore();
  const projectTasks = tasks.filter(t => t.projectId === projectId);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [draggingTask, setDraggingTask] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [originalLeft, setOriginalLeft] = useState(0);

  const getDaysFromStart = (dateStr: string) => {
    return (new Date(dateStr).getTime() - START_DATE) / (1000 * 60 * 60 * 24);
  };

  const handleMouseDown = (e: React.MouseEvent, id: string, currentDate: string) => {
    setDraggingTask(id);
    setStartX(e.clientX);
    setOriginalLeft(getDaysFromStart(currentDate) * PIXELS_PER_DAY);
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingTask) return;
      const dx = e.clientX - startX;
      const newLeft = originalLeft + dx;
      const newDaysFromStart = Math.round(newLeft / PIXELS_PER_DAY);
      
      const newDate = new Date(START_DATE + newDaysFromStart * 24 * 60 * 60 * 1000);
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
  }, [draggingTask, startX, originalLeft, updateTaskDates]);

  // Generate 30 days of headers
  const days = Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(START_DATE + i * 24 * 60 * 60 * 1000);
    return { 
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isToday: d.toISOString().split('T')[0] === '2024-09-25' // mock today
    };
  });

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
          <div className="absolute inset-0 flex pointer-events-none">
            {days.map((day, i) => (
              <div key={i} className={`shrink-0 w-[30px] border-r border-border/50 h-full ${day.isToday ? 'bg-primary/5' : ''}`} />
            ))}
          </div>
          
          {/* Today line */}
          <div className="absolute top-0 bottom-0 w-px bg-primary z-0 pointer-events-none" style={{ left: 10 * PIXELS_PER_DAY + PIXELS_PER_DAY/2 }} />

          {/* Task bars */}
          {projectTasks.map((task, index) => {
            const left = getDaysFromStart(task.dueDate) * PIXELS_PER_DAY;
            // Fake duration based on estimated hours
            const width = Math.max(PIXELS_PER_DAY, (task.estimatedHours / 8) * PIXELS_PER_DAY);
            const isCritical = task.priority === 'critical';
            
            return (
              <div key={task.id} className="absolute h-12 flex items-center" style={{ top: index * 48, left: 0, right: 0 }}>
                <div 
                  className={`h-7 rounded-sm border cursor-ew-resize flex items-center px-2 text-xs font-medium text-white overflow-hidden ${isCritical ? 'bg-[#A03030] border-[#A03030]' : 'bg-primary border-primary-foreground/20'}`}
                  style={{ 
                    marginLeft: left - width, 
                    width,
                    opacity: draggingTask === task.id ? 0.7 : 1,
                    zIndex: draggingTask === task.id ? 20 : 10
                  }}
                  onMouseDown={(e) => handleMouseDown(e, task.id, task.dueDate)}
                >
                  <span className="truncate">{task.estimatedHours}h</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
