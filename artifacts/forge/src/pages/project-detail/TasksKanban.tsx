import { useTasksStore } from "@/store/tasks";
import { useAuthStore } from "@/store/auth";
import { TaskStatus } from "@/data/mockData";
import { useUpdateTask } from "@/hooks/useTasks";
import { useShots } from "@/hooks/useShots";
import { useAssets } from "@/hooks/useAssets";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriorityChip } from "@/components/shared/PriorityChip";
import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  ChevronDown,
  Clock,
  Tag,
  Sparkles,
  HandMetal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: "not-started", title: "Not Started" },
  { id: "todo", title: "To Do" },
  { id: "in-progress", title: "In Progress" },
  { id: "bottleneck", title: "Bottleneck" },
  { id: "review", title: "Review" },
  { id: "lead-review", title: "Lead Review" },
  { id: "approved", title: "Approved" },
  { id: "complete", title: "Complete" },
  { id: "cancelled", title: "Cancelled" },
];

// This component renders two structurally different task shapes depending
// on the caller: pages/tasks.tsx passes real TaskDTO[] (field: `assignedTo`,
// no `projectId`), while pages/project-detail/TasksTab.tsx passes no
// `tasks` prop at all and this component falls back to the legacy mock
// `Task[]` from useTasksStore (field: `assigneeId`, has `projectId`). This
// normalizer tolerates both instead of assuming one shape.
const getAssigneeId = (t: any): string | null | undefined =>
  t.assignedTo ?? t.assigneeId;

// Real TaskDTO has no `projectId` field at all — a task's project is only
// reachable indirectly via `entityId` -> shot/asset -> `projectId` (same
// resolution pages/tasks.tsx and TaskDrawer.tsx already do). The legacy
// mock `Task` shape has `projectId` directly, so that's tried first and
// `entityProjectMap` (built by the real-data caller, empty for the legacy
// fallback) is only consulted when it's missing.
const getProjectId = (
  t: any,
  entityProjectMap: Record<string, string>,
): string | undefined => t.projectId ?? entityProjectMap[t.entityId];

function SortableTaskCard({
  task,
  onUpdateTask,
  entityProjectMap,
}: {
  task: any;
  onUpdateTask: (id: string, updates: Record<string, unknown>) => void;
  entityProjectMap: Record<string, string>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "Task", task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isOverdue = new Date(task.dueDate) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="mb-3 cursor-grab active:cursor-grabbing outline-none"
    >
      <Card className="p-3 shadow-sm border-border hover:border-primary/50 transition-colors flex flex-col gap-2 relative overflow-hidden group">
        {/* Priority accent bar */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 ${
            task.priority === "critical"
              ? "bg-red-500"
              : task.priority === "high"
                ? "bg-orange-500"
                : task.priority === "medium"
                  ? "bg-blue-500"
                  : "bg-green-500"
          }`}
        />

        <div className="pl-2">
          <div className="text-sm font-semibold leading-tight text-foreground/90">
            {task.title}
          </div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {getProjectId(task, entityProjectMap)} • {task.department}
          </div>
        </div>

        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-2 mt-1">
            {task.tags.map((tag: string) => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded border border-border flex items-center gap-1"
              >
                <Tag className="w-2.5 h-2.5" /> {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pl-2 border-t border-border/50 pt-2">
          <div className="flex items-center gap-2">
            <UserAvatar userId={getAssigneeId(task) ?? ""} />
            <div
              className={`flex items-center gap-1 text-[10px] ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}
            >
              <Clock className="w-3 h-3" />
              {new Date(task.dueDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
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
              <DropdownMenuItem
                onSelect={() => onUpdateTask(task.id, { priority: "critical" })}
              >
                Critical
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onUpdateTask(task.id, { priority: "high" })}
              >
                High
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onUpdateTask(task.id, { priority: "medium" })}
              >
                Medium
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onUpdateTask(task.id, { priority: "low" })}
              >
                Low
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
    </div>
  );
}

function ClaimableTaskCard({
  task,
  onClaim,
  entityProjectMap,
}: {
  task: any;
  onClaim: () => void;
  entityProjectMap: Record<string, string>;
}) {
  const [claiming, setClaiming] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.85,
        transition: { duration: 0.25, ease: "easeIn" },
      }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mb-3"
    >
      <Card className="p-3 shadow-sm border-dashed border-amber-500/30 hover:border-amber-500/60 transition-colors flex flex-col gap-2 relative overflow-hidden group bg-amber-500/[0.03]">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/50" />
        <div className="pl-2">
          <div className="text-sm font-semibold leading-tight text-foreground/90">
            {task.title}
          </div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {getProjectId(task, entityProjectMap)} • {task.department}
          </div>
        </div>

        <div className="flex items-center justify-between mt-1 pl-2 border-t border-border/50 pt-2">
          <div
            className={`flex items-center gap-1 text-[10px] text-muted-foreground`}
          >
            <Clock className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
          <PriorityChip priority={task.priority} />
        </div>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-1 h-7 text-xs border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:text-amber-600"
            disabled={claiming}
            onClick={() => {
              setClaiming(true);
              // Let the press/claim animation register before the card animates out of the pool.
              setTimeout(onClaim, 120);
            }}
          >
            <HandMetal className="w-3 h-3 mr-1.5" />{" "}
            {claiming ? "Claiming…" : "Claim Task"}
          </Button>
        </motion.div>
      </Card>
    </motion.div>
  );
}

function DroppableColumn({
  col,
  tasks,
  onUpdateTask,
  entityProjectMap,
}: {
  col: { id: TaskStatus; title: string };
  tasks: any[];
  onUpdateTask: (id: string, updates: Record<string, unknown>) => void;
  entityProjectMap: Record<string, string>;
}) {
  const { setNodeRef } = useDroppable({ id: col.id });
  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg border border-border">
      <div className="p-3 font-semibold text-sm border-b border-border flex justify-between items-center bg-muted/50 rounded-t-lg">
        {col.title}
        <span className="text-xs bg-background px-2 py-0.5 rounded-full text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-[150px]"
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
          id={col.id}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onUpdateTask={onUpdateTask}
              entityProjectMap={entityProjectMap}
            />
          ))}
          {tasks.length === 0 && (
            <div className="h-20 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
              Drop here
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export default function KanbanView({
  projectId,
  tasks,
  entityProjectMap = {},
}: {
  projectId?: string;
  tasks?: any[];
  // Only meaningful (and only ever passed) when `tasks` is real TaskDTO[]
  // from pages/tasks.tsx — see getProjectId() above. The legacy fallback
  // path (pages/project-detail/TasksTab.tsx, no `tasks` prop) doesn't need
  // it since its own task.projectId field already works directly.
  entityProjectMap?: Record<string, string>;
}) {
  const storeTasks = useTasksStore((state) => state.tasks);
  const storeUpdateTaskStatus = useTasksStore((state) => state.updateTaskStatus);
  const storeUpdateTask = useTasksStore((state) => state.updateTask);
  const updateTaskMutation = useUpdateTask();
  const { currentUser } = useAuthStore();
  const { toast } = useToast();
  const sourceTasks = tasks || storeTasks;
  // The legacy fallback path (pages/project-detail/TasksTab.tsx) never passes
  // `entityProjectMap` — but since store/auth.ts's login hydration overwrites
  // useTasksStore's tasks with raw, untranslated real TaskDTO[] data (no
  // `projectId` field), `storeTasks` needs the exact same entityId -> project
  // lookup real TaskDTO[] callers rely on. Build it here unconditionally
  // (react-query dedupes against pages/tasks.tsx's identical query) and let
  // an explicitly-passed prop take priority.
  const { data: liveShots = [] } = useShots();
  const { data: liveAssets = [] } = useAssets();
  const builtEntityProjectMap = useMemo(() => {
    const map: Record<string, string> = {};
    liveShots.forEach((s) => {
      map[s.id] = s.projectId;
    });
    liveAssets.forEach((a) => {
      map[a.id] = a.projectId;
    });
    return map;
  }, [liveShots, liveAssets]);
  const resolvedEntityProjectMap = useMemo(
    () => ({ ...builtEntityProjectMap, ...entityProjectMap }),
    [builtEntityProjectMap, entityProjectMap],
  );
  // `tasks` is only ever passed by pages/tasks.tsx (real TaskDTO[] from the
  // backend). pages/project-detail/TasksTab.tsx passes only `projectId` (or
  // nothing) and relies on the storeTasks fallback above — mutations must
  // route to whichever data source is actually backing what's on screen.
  const isRealData = !!tasks;

  const updateTaskStatus = (id: string, status: TaskStatus) =>
    isRealData
      ? updateTaskMutation.mutate({ id, status })
      : storeUpdateTaskStatus(id, status);
  const updateTask = (id: string, updates: Record<string, unknown>) =>
    isRealData
      ? updateTaskMutation.mutate({ id, ...updates })
      : storeUpdateTask(id, updates);

  // Real TaskDTO[] has no `projectId` column, so filtering must go through
  // the entityId -> project lookup (getProjectId), not a direct field read —
  // a direct `t.projectId === projectId` read silently matched nothing once
  // real data replaced the mock array, making every project-scoped board
  // appear to have zero tasks.
  const projectTasks = projectId
    ? sourceTasks.filter(
        (t) => getProjectId(t, resolvedEntityProjectMap) === projectId,
      )
    : sourceTasks;
  const availableTasks = projectTasks.filter((t) => !getAssigneeId(t));

  const [activeTask, setActiveTask] = useState<any | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
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

    const isOverColumn = COLUMNS.some((c) => c.id === overId);
    if (isOverColumn) {
      updateTaskStatus(activeId, overId as TaskStatus);
      return;
    }

    const overTask = sourceTasks.find((t) => t.id === overId);
    if (overTask && overTask.status) {
      updateTaskStatus(activeId, overTask.status);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex overflow-x-auto p-4 gap-4 pb-8">
        {/* Self-serve pool: unassigned tasks any eligible teammate can claim */}
        <div className="flex-shrink-0 w-72 flex flex-col bg-amber-500/[0.04] rounded-lg border border-dashed border-amber-500/30">
          <div className="p-3 font-semibold text-sm border-b border-amber-500/20 flex justify-between items-center bg-amber-500/10 rounded-t-lg text-amber-700 dark:text-amber-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Available Tasks
            </span>
            <span className="text-xs bg-background px-2 py-0.5 rounded-full text-muted-foreground">
              {availableTasks.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <AnimatePresence initial={false}>
              {availableTasks.map((task) => (
                <ClaimableTaskCard
                  key={task.id}
                  task={task}
                  entityProjectMap={resolvedEntityProjectMap}
                  onClaim={() => {
                    if (!currentUser) return;
                    updateTask(
                      task.id,
                      isRealData
                        ? { assignedTo: currentUser.id }
                        : { assigneeId: currentUser.id },
                    );
                    toast({
                      title: "Task Claimed",
                      description: `"${task.title}" is now assigned to you.`,
                    });
                  }}
                />
              ))}
            </AnimatePresence>
            {availableTasks.length === 0 && (
              <div className="h-20 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground text-center px-4">
                No unclaimed tasks right now
              </div>
            )}
          </div>
        </div>

        {COLUMNS.map((col) => {
          const columnTasks = projectTasks.filter(
            (t) => t.status === col.id && getAssigneeId(t),
          );
          return (
            <DroppableColumn
              key={col.id}
              col={col}
              tasks={columnTasks}
              onUpdateTask={updateTask}
              entityProjectMap={resolvedEntityProjectMap}
            />
          );
        })}
      </div>
      {createPortal(
        <DragOverlay>
          {activeTask ? (
            <div className="opacity-80 rotate-2">
              <Card className="p-3 shadow-xl border-primary w-72">
                <div className="text-sm font-medium leading-tight mb-2">
                  {activeTask.title}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <PriorityChip priority={activeTask.priority} />
                  <UserAvatar userId={getAssigneeId(activeTask) ?? ""} />
                </div>
              </Card>
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
