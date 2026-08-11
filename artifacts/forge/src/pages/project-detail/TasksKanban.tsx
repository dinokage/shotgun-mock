import { useTasksStore } from '@/store/tasks';
import { Task, TaskStatus } from '@/data/mockData';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { PriorityChip } from '@/components/shared/PriorityChip';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calendar, ChevronDown, Clock, Tag } from 'lucide-react';

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'lead-review', title: 'Lead Review' },
  { id: 'manager-review', title: 'Manager Review' },
  { id: 'approved', title: 'Approved' },
  { id: 'bottleneck', title: 'Bottleneck' }
];

function SortableTaskCard({ task }: { task: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { type: 'Task', task } });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isOverdue = new Date(task.dueDate) < new Date();

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-3 cursor-grab active:cursor-grabbing outline-none">
      <Card className="p-3 shadow-sm border-border hover:border-primary/50 transition-colors flex flex-col gap-2 relative overflow-hidden group">
        {/* Priority accent bar */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
          task.priority === 'critical' ? 'bg-red-500' : 
          task.priority === 'high' ? 'bg-orange-500' : 
          task.priority === 'medium' ? 'bg-blue-500' : 'bg-green-500'
        }`} />
        
        <div className="pl-2">
          <div className="text-sm font-semibold leading-tight text-foreground/90">{task.title}</div>
          <div className="text-xs text-muted-foreground mt-1 truncate">{task.projectId} • {task.department}</div>
        </div>
        
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-2 mt-1">
            {task.tags.map((tag: string) => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded border border-border flex items-center gap-1">
                <Tag className="w-2.5 h-2.5" /> {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pl-2 border-t border-border/50 pt-2">
          <div className="flex items-center gap-2">
            <UserAvatar userId={task.assigneeId} />
            <div className={`flex items-center gap-1 text-[10px] ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
              <Clock className="w-3 h-3" />
              {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div 
                className="cursor-pointer hover:opacity-80 transition-opacity" 
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag start when clicking menu
              >
                <PriorityChip priority={task.priority} />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32 z-50">
              <DropdownMenuItem onSelect={() => console.log('Update to critical')}>Critical</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => console.log('Update to high')}>High</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => console.log('Update to medium')}>Medium</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => console.log('Update to low')}>Low</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
    </div>
  );
}

export default function KanbanView({ projectId, tasks }: { projectId?: string, tasks?: any[] }) {
  const storeTasks = useTasksStore(state => state.tasks);
  const { updateTaskStatus } = useTasksStore();
  const sourceTasks = tasks || storeTasks;
  const projectTasks = projectId ? sourceTasks.filter(t => t.projectId === projectId) : sourceTasks;
  
  const [activeTask, setActiveTask] = useState<any | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveTask(active.data.current?.task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const isOverColumn = COLUMNS.some(c => c.id === overId);
    if (isOverColumn) {
      updateTaskStatus(activeId, overId as TaskStatus);
      return;
    }

    const overTask = tasks.find(t => t.id === overId);
    if (overTask && overTask.status) {
      updateTaskStatus(activeId, overTask.status);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-full flex overflow-x-auto p-4 gap-4 pb-8">
        {COLUMNS.map(col => {
          const columnTasks = projectTasks.filter(t => t.status === col.id);
          return (
            <div key={col.id} className="flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg border border-border">
              <div className="p-3 font-semibold text-sm border-b border-border flex justify-between items-center bg-muted/50 rounded-t-lg">
                {col.title}
                <span className="text-xs bg-background px-2 py-0.5 rounded-full text-muted-foreground">{columnTasks.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <SortableContext items={columnTasks.map(t => t.id)} strategy={verticalListSortingStrategy} id={col.id}>
                  {columnTasks.map(task => <SortableTaskCard key={task.id} task={task} />)}
                  {columnTasks.length === 0 && (
                    <div className="h-20 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                      Drop here
                    </div>
                  )}
                </SortableContext>
              </div>
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="opacity-80 rotate-2">
            <Card className="p-3 shadow-xl border-primary w-72">
              <div className="text-sm font-medium leading-tight mb-2">{activeTask.title}</div>
              <div className="flex items-center justify-between mt-3">
                <PriorityChip priority={activeTask.priority} />
                <UserAvatar userId={activeTask.assigneeId} />
              </div>
            </Card>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
