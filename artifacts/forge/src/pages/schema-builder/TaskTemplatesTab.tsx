import { useMemo, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useLocation } from "wouter";
import { addDays, format } from "date-fns";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  Copy,
  Trash2,
  ClipboardList,
  Clock,
  ListChecks,
  Rocket,
  Check,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSchemaStore } from "@/store/schema";
import { useTasksStore } from "@/store/tasks";
import { useAuthStore } from "@/store/auth";
import { DEPARTMENTS, PROJECTS, type Task } from "@/data/mockData";
import { TemplateTaskRow } from "./TemplateTaskRow";
import { useToast } from "@/hooks/use-toast";
import { stagger, DURATION, EASE_DISSOLVE } from "@/lib/motion";

export function TaskTemplatesTab() {
  const templates = useSchemaStore((s) => s.templates);
  const addTemplate = useSchemaStore((s) => s.addTemplate);
  const updateTemplate = useSchemaStore((s) => s.updateTemplate);
  const deleteTemplate = useSchemaStore((s) => s.deleteTemplate);
  const duplicateTemplate = useSchemaStore((s) => s.duplicateTemplate);
  const addTemplateTask = useSchemaStore((s) => s.addTemplateTask);
  const updateTemplateTask = useSchemaStore((s) => s.updateTemplateTask);
  const removeTemplateTask = useSchemaStore((s) => s.removeTemplateTask);
  const reorderTemplateTasks = useSchemaStore((s) => s.reorderTemplateTasks);

  const addTask = useTasksStore((s) => s.addTask);
  const currentUser = useAuthStore((s) => s.currentUser);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [selectedId, setSelectedId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyProjectId, setApplyProjectId] = useState("");
  const [justApplied, setJustApplied] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleCreate = () => {
    const id = addTemplate({ name: "New Template" });
    setSelectedId(id);
  };

  const handleDelete = (id: string) => {
    const wasSelected = id === selectedId;
    deleteTemplate(id);
    if (wasSelected) {
      const remaining = templates.filter((t) => t.id !== id);
      setSelectedId(remaining[0]?.id ?? null);
    }
    toast({ title: "Template deleted" });
  };

  const handleDuplicate = (id: string) => {
    const newId = duplicateTemplate(id);
    if (newId) setSelectedId(newId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!selected) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = selected.tasks.map((t) => t.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderTemplateTasks(selected.id, arrayMove(ids, oldIndex, newIndex));
  };

  const totalHours =
    selected?.tasks.reduce((sum, t) => sum + t.estimatedHours, 0) ?? 0;

  const openApplyDialog = () => {
    setApplyProjectId("");
    setJustApplied(false);
    setApplyOpen(true);
  };

  const handleApply = () => {
    if (!selected || !applyProjectId || !currentUser) return;
    const project = PROJECTS.find((p) => p.id === applyProjectId);
    if (!project) return;

    const sortedTasks = [...selected.tasks].sort((a, b) => a.order - b.order);
    sortedTasks.forEach((tt, i) => {
      const dept = DEPARTMENTS.find((d) => d.id === tt.department);
      const assigneeId = dept?.leadId || dept?.supervisorId || currentUser.id;
      const newTask: Task = {
        id: `tmpl-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        title: tt.title,
        description: `Generated from the "${selected.name}" task template.`,
        projectId: applyProjectId,
        assigneeId,
        assignedById: currentUser.id,
        status: "todo",
        priority: tt.priority,
        dueDate: format(addDays(new Date(), (i + 1) * 7), "yyyy-MM-dd"),
        estimatedHours: tt.estimatedHours,
        actualHours: 0,
        tags: ["template"],
        dependencies: [],
        checklist: [],
        comments: [],
        attachments: [],
        department: dept?.name || "General",
        createdAt: new Date().toISOString(),
        lastStatusUpdate: new Date().toISOString(),
        dailyLogs: [],
        pipelinePhase: "MAIN",
        approvalHistory: [],
      };
      addTask(newTask);
    });

    setJustApplied(true);
    toast({
      title: "Template applied",
      description: `Added ${sortedTasks.length} tasks from "${selected.name}" to ${project.name}.`,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Template list */}
      <div className="space-y-3">
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button
            onClick={handleCreate}
            className="w-full gap-2 justify-start"
            variant="outline"
          >
            <Plus className="w-4 h-4" /> New Template
          </Button>
        </motion.div>

        <LayoutGroup>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {templates.map((tmpl, i) => {
                const hours = tmpl.tasks.reduce(
                  (sum, t) => sum + t.estimatedHours,
                  0,
                );
                return (
                  <motion.div
                    key={tmpl.id}
                    layout
                    {...stagger(i, 0.03)}
                    exit={{ opacity: 0, x: -8 }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(tmpl.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(tmpl.id);
                        }
                      }}
                      className={cn(
                        "w-full text-left rounded-lg border p-3 transition-colors group relative cursor-pointer",
                        tmpl.id === selectedId
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20 hover:bg-primary/10"
                          : "border-border hover:border-primary/30 hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <ClipboardList className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate pr-5">
                            {tmpl.name || "Untitled"}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <ListChecks className="w-3 h-3" />
                              {tmpl.tasks.length} tasks
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {hours}h
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1 rounded hover:bg-muted text-muted-foreground">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => handleDuplicate(tmpl.id)}
                              className="gap-2"
                            >
                              <Copy className="w-3.5 h-3.5" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() =>
                                setDeleteTarget({
                                  id: tmpl.id,
                                  name: tmpl.name || "Untitled",
                                })
                              }
                              className="gap-2 text-red-500 focus:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </LayoutGroup>

        {templates.length === 0 && (
          <div className="text-center py-10 text-xs text-muted-foreground border-2 border-dashed border-border rounded-lg">
            No templates yet. Create your first task bundle.
          </div>
        )}
      </div>

      {/* Editor */}
      <div>
        {!selected ? (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center text-muted-foreground border-2 border-dashed border-border rounded-lg gap-2">
            <ClipboardList className="w-8 h-8 opacity-40" />
            <p className="text-sm">
              Select or create a template to define its task bundle.
            </p>
          </div>
        ) : (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE_DISSOLVE }}
            className="space-y-4"
          >
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[240px] space-y-2">
                    <Input
                      value={selected.name}
                      onChange={(e) =>
                        updateTemplate(selected.id, { name: e.target.value })
                      }
                      className="text-lg font-bold h-9 border-transparent bg-transparent px-1.5 -ml-1.5 hover:border-input focus-visible:border-input focus-visible:bg-background"
                      placeholder="Template name (e.g. Standard Shot Pipeline)"
                    />
                    <Textarea
                      value={selected.description}
                      onChange={(e) =>
                        updateTemplate(selected.id, {
                          description: e.target.value,
                        })
                      }
                      placeholder="When should this bundle be applied?"
                      className="text-xs min-h-[40px] resize-none border-transparent bg-transparent px-1.5 -ml-1.5 hover:border-input focus-visible:border-input focus-visible:bg-background"
                    />
                  </div>
                  <motion.div
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Button
                      className="gap-2"
                      disabled={selected.tasks.length === 0}
                      onClick={openApplyDialog}
                    >
                      <Rocket className="w-4 h-4" /> Apply to Project
                    </Button>
                  </motion.div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-3">
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <ListChecks className="w-3 h-3" /> {selected.tasks.length}{" "}
                    tasks
                  </Badge>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Clock className="w-3 h-3" /> {totalHours}h estimated total
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Tasks</h3>
                  <motion.div
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={() =>
                        addTemplateTask(selected.id, { title: "New Task" })
                      }
                    >
                      <Plus className="w-3 h-3" /> Add Task
                    </Button>
                  </motion.div>
                </div>

                {selected.tasks.length === 0 ? (
                  <div className="text-center py-10 text-xs text-muted-foreground border-2 border-dashed border-border rounded-lg">
                    No tasks yet — add the pipeline steps that make up this
                    bundle.
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={selected.tasks.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        <AnimatePresence initial={false}>
                          {selected.tasks.map((task) => (
                            <TemplateTaskRow
                              key={task.id}
                              task={task}
                              onUpdate={(updates) =>
                                updateTemplateTask(
                                  selected.id,
                                  task.id,
                                  updates,
                                )
                              }
                              onRemove={() =>
                                removeTemplateTask(selected.id, task.id)
                              }
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Apply to Project dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Apply "{selected?.name}" to a Project</DialogTitle>
            <DialogDescription>
              This creates {selected?.tasks.length ?? 0} new tasks in the
              selected project, pre-filled with each task's department,
              estimated hours, and priority from this template.
            </DialogDescription>
          </DialogHeader>

          <AnimatePresence mode="wait">
            {!justApplied ? (
              <motion.div
                key="pick"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 py-2"
              >
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Project
                  </span>
                  <Select
                    value={applyProjectId}
                    onValueChange={setApplyProjectId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a project…" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECTS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6 flex flex-col items-center text-center gap-2"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                  <Check className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium">
                  {selected?.tasks.length ?? 0} tasks added to{" "}
                  {PROJECTS.find((p) => p.id === applyProjectId)?.name}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <DialogFooter>
            {!justApplied ? (
              <>
                <Button variant="outline" onClick={() => setApplyOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={!applyProjectId}
                  onClick={handleApply}
                  className="gap-2"
                >
                  <Rocket className="w-4 h-4" /> Apply Template
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setApplyOpen(false)}>
                  Close
                </Button>
                <Button
                  className="gap-2"
                  onClick={() => {
                    setApplyOpen(false);
                    navigate(`/projects/${applyProjectId}`);
                  }}
                >
                  Open Project <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete template confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this task template and all of its task
              definitions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
