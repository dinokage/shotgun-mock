import { useTasksStore, TaskStatus } from '@/store/tasks';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { PriorityChip } from '@/components/shared/PriorityChip';
import { UserAvatar } from '@/components/shared/UserAvatar';

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'complete', title: 'Done' },
  { id: 'blocked', title: 'Blocked' }
];

function SortableTaskCard({ task }: { task: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { type: 'Task', task } });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-3 cursor-grab active:cursor-grabbing outline-none">
      <Card className="p-3 shadow-sm border-border hover:border-primary/50 transition-colors">
        <div className="text-sm font-medium leading-tight mb-2">{task.title}</div>
        <div className="flex items-center justify-between mt-3">
          <PriorityChip priority={task.priority} />
          <UserAvatar userId={task.assigneeId} />
        </div>
      </Card>
    </div>
  );
}

export default function KanbanView({ projectId }: { projectId?: string }) {
  const { tasks, updateTaskStatus } = useTasksStore();
  const projectTasks = projectId ? tasks.filter(t => t.projectId === projectId) : tasks;
  
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
