import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { DEPARTMENTS, type Task } from '@/data/mockData';
import type { TaskTemplateItem } from '@/store/schema';
import { DURATION, EASE_DISSOLVE } from '@/lib/motion';

const PRIORITIES: Task['priority'][] = ['low', 'medium', 'high', 'critical'];

const PRIORITY_DOT: Record<Task['priority'], string> = {
  low: 'bg-green-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

export function TemplateTaskRow({
  task,
  onUpdate,
  onRemove,
}: {
  task: TaskTemplateItem;
  onUpdate: (updates: Partial<TaskTemplateItem>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: DURATION.fast } }}
      transition={{ duration: DURATION.base, ease: EASE_DISSOLVE }}
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-card p-2.5',
        isDragging ? 'border-primary shadow-lg cursor-grabbing' : 'border-border'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        aria-label="Drag to reorder task"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <Input
        value={task.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        className="h-8 text-sm font-medium flex-1 min-w-[140px]"
        placeholder="Task title"
      />

      <Select value={task.department} onValueChange={(v) => onUpdate({ department: v })}>
        <SelectTrigger className="h-8 text-xs w-[168px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DEPARTMENTS.map((d) => (
            <SelectItem key={d.id} value={d.id} className="text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                {d.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1 shrink-0 w-[92px]">
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Input
          type="number"
          min={0}
          value={task.estimatedHours}
          onChange={(e) => onUpdate({ estimatedHours: Math.max(0, Number(e.target.value) || 0) })}
          className="h-8 text-xs px-2"
        />
      </div>

      <Select value={task.priority} onValueChange={(v) => onUpdate({ priority: v as Task['priority'] })}>
        <SelectTrigger className="h-8 text-xs w-[112px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p} className="text-xs capitalize">
              <span className="inline-flex items-center gap-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOT[p])} />
                {p}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <motion.button
        type="button"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        onClick={onRemove}
        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
        aria-label="Remove task"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </motion.button>
    </motion.div>
  );
}
