import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDndContext,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { PriorityChip } from "@/components/shared/PriorityChip";
import { Search, Inbox, Clock } from "lucide-react";
import { Task } from "@/data/mockData";
import { useUsers } from "@/hooks/useUsers";
import { useDepartmentStore } from "@/store/departments";
import { useProjectStore } from "@/store/projects";
import { useTasksStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import { useToast } from "@/hooks/use-toast";
import { getAssigneeId, getProjectId, useEntityProjectMap } from "@/lib/taskShape";
import { cn } from "@/lib/utils";
import { REFERENCE_DATE } from "./utils";

const UNASSIGNED = "__unassigned__";

function capacityColor(cap: number) {
  return cap > 90
    ? "bg-red-500"
    : cap > 75
      ? "bg-yellow-500"
      : "bg-emerald-500";
}

function BoardTaskCard({ task }: { task: Task }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "Task", task },
  });
  const { setActiveTaskDrawer } = useUIStore();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isOverdue = new Date(task.dueDate) < REFERENCE_DATE;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="mb-2 cursor-grab active:cursor-grabbing outline-none"
    >
      <Card
        className="p-2.5 shadow-sm border-border hover:border-primary/50 transition-colors flex flex-col gap-1.5 relative overflow-hidden group"
        onClick={() => setActiveTaskDrawer(task.id)}
      >
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1",
            task.priority === "critical"
              ? "bg-red-500"
              : task.priority === "high"
                ? "bg-orange-500"
                : task.priority === "medium"
                  ? "bg-blue-500"
                  : "bg-green-500",
          )}
        />
        <div className="pl-2 text-xs font-semibold leading-tight text-foreground/90 truncate">
          {task.title}
        </div>
        <div className="pl-2 flex items-center justify-between">
          <PriorityChip
            priority={task.priority}
            className="text-[9px] px-1.5 py-0"
          />
          <div
            className={cn(
              "flex items-center gap-1 text-[10px]",
              isOverdue ? "text-red-500 font-medium" : "text-muted-foreground",
            )}
          >
            <Clock className="w-2.5 h-2.5" />
            {new Date(task.dueDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

function BoardColumn({
  id,
  name,
  subtitle,
  avatar,
  capacity,
  tasks,
  isPool,
}: {
  id: string;
  name: string;
  subtitle?: string;
  avatar?: string;
  capacity?: number;
  tasks: Task[];
  isPool?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  // isOver only fires when the pointer is over this column's OWN droppable
  // background, which never happens while hovering a populated column — the
  // pointer is over a task card (a separate sortable droppable) instead. Fall
  // back to checking whether the live drag-over target is one of this
  // column's own task cards so the highlight still lights up.
  const { over } = useDndContext();
  const isDropTarget =
    isOver ||
    (over != null && (over.id === id || tasks.some((t) => t.id === over.id)));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-64 flex flex-col rounded-lg border transition-colors",
        isPool
          ? "bg-muted/20 border-dashed border-border"
          : "bg-muted/30 border-border",
        isDropTarget && "ring-2 ring-primary border-primary bg-primary/5",
      )}
    >
      <div className="p-3 border-b border-border rounded-t-lg bg-muted/50 flex items-center gap-2">
        {isPool ? (
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        ) : (
          <Avatar className="w-7 h-7 shrink-0">
            <AvatarImage src={avatar} />
            <AvatarFallback className="text-xs">
              {name.charAt(0)}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate leading-tight">
            {name}
          </div>
          <div className="text-[10px] text-muted-foreground truncate leading-tight">
            {subtitle}
          </div>
        </div>
        <span className="text-xs bg-background px-2 py-0.5 rounded-full text-muted-foreground shrink-0">
          {tasks.length}
        </span>
      </div>

      {!isPool && capacity !== undefined && (
        <div className="px-3 pt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={cn("h-full", capacityColor(capacity))}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(capacity, 100)}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <span className="text-[9px] font-mono text-muted-foreground">
            {capacity}%
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 min-h-[120px]">
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
          id={id}
        >
          {tasks.map((task) => (
            <BoardTaskCard key={task.id} task={task} />
          ))}
          {tasks.length === 0 && (
            <div
              className={cn(
                "h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-[11px] text-center px-3 text-muted-foreground transition-colors",
                isDropTarget ? "border-primary text-primary" : "border-border",
              )}
            >
              {isPool ? "Unassigned tasks land here" : "Drop a task to assign"}
            </div>
          )}
        </SortableContext>
      </div>
    </motion.div>
  );
}

export default function TeamBoard() {
  const { toast } = useToast();
  const tasks = useTasksStore((s) => s.tasks);
  const reassignTask = useTasksStore((s) => s.reassignTask);
  const revokeAssignment = useTasksStore((s) => s.revokeAssignment);
  // Live query, not useUserStore's once-at-login snapshot -- a newly added
  // employee wouldn't appear as a column here for anyone already logged in
  // otherwise. Real User rows have no `capacity` column (mock-only field);
  // read as unknown rather than a verified 0%, same as profile.tsx.
  const { data: users = [] } = useUsers();
  const departments = useDepartmentStore((s) => s.departments);
  const projects = useProjectStore((s) => s.projects);
  const entityProjectMap = useEntityProjectMap();

  const [projectFilter, setProjectFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Defaults to true: this board's whole purpose is bulk-assigning currently
  // *unassigned* work onto people, so on a fresh import (or any moment where
  // most/all tasks are still unassigned) everyone legitimately has zero
  // tasks yet -- defaulting to hide empty-handed people made the board look
  // entirely empty ("No team members match these filters") for exactly the
  // situation it exists to fix.
  const [showEmpty, setShowEmpty] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const filteredTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (
          projectFilter !== "all" &&
          getProjectId(t, entityProjectMap) !== projectFilter
        )
          return false;
        // Department filter needs to narrow the tasks themselves, not just which
        // people columns are visible — otherwise the Unassigned pool keeps
        // showing every unassigned task studio-wide while the board only shows
        // e.g. Lighting's people, which reads as "Lighting has a huge backlog"
        // when most of it isn't Lighting work at all.
        if (departmentFilter !== "all") {
          const dept = departments.find((d) => d.id === departmentFilter);
          if (!dept || t.department !== dept.name) return false;
        }
        if (search && !t.title.toLowerCase().includes(search.toLowerCase()))
          return false;
        return true;
      }),
    [tasks, projectFilter, departmentFilter, search, departments, entityProjectMap],
  );

  const unassignedTasks = useMemo(
    () => filteredTasks.filter((t) => !getAssigneeId(t)),
    [filteredTasks],
  );

  const people = useMemo(() => {
    return users
      .filter((u) => u.role !== "client")
      .filter(
        (u) =>
          departmentFilter === "all" || u.departmentId === departmentFilter,
      )
      .map((user) => ({
        user,
        tasks: filteredTasks.filter((t) => getAssigneeId(t) === user.id),
      }))
      .filter((col) => showEmpty || col.tasks.length > 0)
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }, [users, filteredTasks, departmentFilter, showEmpty]);

  const findTask = (id: string) => tasks.find((t) => t.id === id);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(event.active.data.current?.task ?? null);
  };

  const resolveTargetUserId = (overId: string): string | undefined => {
    if (overId === UNASSIGNED) return "";
    if (users.some((u) => u.id === overId)) return overId;
    const overTask = findTask(overId);
    if (overTask) return getAssigneeId(overTask) ?? "";
    return undefined;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeTaskItem = findTask(active.id as string);
    if (!activeTaskItem) return;

    const targetUserId = resolveTargetUserId(over.id as string);
    if (targetUserId === undefined) return;
    if ((getAssigneeId(activeTaskItem) || "") === targetUserId) return;

    if (targetUserId === "") {
      revokeAssignment(activeTaskItem.id);
      toast({
        title: "Task unassigned",
        description: `${activeTaskItem.title} moved back to the unassigned pool.`,
      });
    } else {
      const person = users.find((u) => u.id === targetUserId);
      reassignTask(activeTaskItem.id, targetUserId);
      toast({
        title: "Task assigned",
        description: `${activeTaskItem.title} assigned to ${person?.name ?? "team member"}.`,
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card/50 px-6 py-3 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Bulk Assignment Board</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drag a task card onto a person to assign it &middot; drag onto
            Unassigned to release it
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              className="pl-9 h-9 w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[190px] h-9">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
            <Switch checked={showEmpty} onCheckedChange={setShowEmpty} />
            Show everyone
          </label>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 flex overflow-x-auto p-4 gap-4 pb-8 bg-background">
          <BoardColumn
            id={UNASSIGNED}
            name="Unassigned"
            subtitle="Needs an owner"
            tasks={unassignedTasks}
            isPool
          />
          <div className="w-px bg-border shrink-0 mx-1" />
          <AnimatePresence mode="popLayout">
            {people.map(({ user, tasks: userTasks }) => (
              <BoardColumn
                key={user.id}
                id={user.id}
                name={user.name}
                subtitle={user.title ?? undefined}
                avatar={user.avatar ?? undefined}
                tasks={userTasks}
              />
            ))}
          </AnimatePresence>
          {people.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              No team members match these filters.
            </div>
          )}
        </div>

        {createPortal(
          <DragOverlay>
            {activeTask ? (
              <div className="opacity-90 rotate-2">
                <Card className="p-3 shadow-xl border-primary w-60">
                  <div className="text-sm font-medium leading-tight mb-2">
                    {activeTask.title}
                  </div>
                  <PriorityChip priority={activeTask.priority} />
                </Card>
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </div>
  );
}
