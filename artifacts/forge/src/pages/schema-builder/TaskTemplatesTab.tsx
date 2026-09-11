import { useEffect, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useLocation } from "wouter";
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
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskTemplateDef } from "@/store/schema";
import {
  useApplyTaskTemplate,
  useCreateTaskTemplate,
  useCreateTemplateItem,
  useDeleteTaskTemplate,
  useDeleteTemplateItem,
  useDuplicateTaskTemplate,
  useReorderTemplateItems,
  useTaskTemplates,
  useUpdateTaskTemplate,
  useUpdateTemplateItem,
} from "@/hooks/useSchemaBuilder";
import { useDepartments } from "@/hooks/useDepartments";
import { useProjects } from "@/hooks/useProjects";
import { useShots } from "@/hooks/useShots";
import { useAssets } from "@/hooks/useAssets";
import { TemplateTaskRow } from "./TemplateTaskRow";
import { describeError, useDebouncedDraft } from "./editing";
import { useToast } from "@/hooks/use-toast";
import { stagger, DURATION, EASE_DISSOLVE } from "@/lib/motion";

function TemplateMetaCard({
  template,
  totalHours,
  onUpdate,
  onApply,
}: {
  template: TaskTemplateDef;
  totalHours: number;
  onUpdate: (
    updates: Partial<Pick<TaskTemplateDef, "name" | "description">>,
  ) => void;
  onApply: () => void;
}) {
  const [draft, updateDraft] = useDebouncedDraft(
    { name: template.name, description: template.description },
    onUpdate,
  );

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[240px] space-y-2">
            <Input
              value={draft.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
              className="text-lg font-bold h-9 border-transparent bg-transparent px-1.5 -ml-1.5 hover:border-input focus-visible:border-input focus-visible:bg-background"
              placeholder="Template name (e.g. Standard Shot Pipeline)"
            />
            <Textarea
              value={draft.description}
              onChange={(e) => updateDraft({ description: e.target.value })}
              placeholder="When should this bundle be applied?"
              className="text-xs min-h-[40px] resize-none border-transparent bg-transparent px-1.5 -ml-1.5 hover:border-input focus-visible:border-input focus-visible:bg-background"
            />
          </div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button
              className="gap-2"
              disabled={template.items.length === 0}
              onClick={onApply}
            >
              <Rocket className="w-4 h-4" /> Apply to Project
            </Button>
          </motion.div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-3">
          <Badge variant="secondary" className="gap-1 font-normal">
            <ListChecks className="w-3 h-3" /> {template.items.length} tasks
          </Badge>
          <Badge variant="secondary" className="gap-1 font-normal">
            <Clock className="w-3 h-3" /> {totalHours}h estimated total
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function TaskTemplatesTab() {
  const { data: templates = [], isLoading } = useTaskTemplates();
  const { data: departments = [] } = useDepartments();
  const { data: projects = [] } = useProjects();

  const createTemplate = useCreateTaskTemplate();
  const updateTemplate = useUpdateTaskTemplate();
  const deleteTemplate = useDeleteTaskTemplate();
  const duplicateTemplate = useDuplicateTaskTemplate();
  const createItem = useCreateTemplateItem();
  const updateItem = useUpdateTemplateItem();
  const deleteItem = useDeleteTemplateItem();
  const reorderItems = useReorderTemplateItems();
  const applyTemplate = useApplyTaskTemplate();

  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyProjectId, setApplyProjectId] = useState("");
  const [applyEntity, setApplyEntity] = useState("");
  const [justApplied, setJustApplied] = useState(false);

  const { data: shots = [] } = useShots(applyProjectId || undefined);
  const { data: assets = [] } = useAssets(applyProjectId || undefined);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    if (templates.length === 0) {
      if (selectedId !== null) setSelectedId(null);
    } else if (!templates.some((t) => t.id === selectedId)) {
      setSelectedId(templates[0].id);
    }
  }, [templates, selectedId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const fail = (title: string) => (err: unknown) =>
    toast({ title, description: describeError(err), variant: "destructive" });

  const handleCreate = async () => {
    try {
      const created = await createTemplate.mutateAsync({ name: "New Template" });
      setSelectedId(created.id);
    } catch (err) {
      fail("Could not create template")(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast({ title: "Template deleted" });
    } catch (err) {
      fail("Could not delete template")(err);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const clone = await duplicateTemplate.mutateAsync(id);
      setSelectedId(clone.id);
    } catch (err) {
      fail("Could not duplicate template")(err);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!selected) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = selected.items.map((t) => t.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderItems
      .mutateAsync({
        templateId: selected.id,
        itemIds: arrayMove(ids, oldIndex, newIndex),
      })
      .catch(fail("Could not reorder tasks"));
  };

  const totalHours =
    selected?.items.reduce((sum, t) => sum + t.estimatedHours, 0) ?? 0;

  const openApplyDialog = () => {
    setApplyProjectId("");
    setApplyEntity("");
    setJustApplied(false);
    setApplyOpen(true);
  };

  const handleApply = async () => {
    if (!selected || !applyEntity) return;
    const [entityType, entityId] = applyEntity.split(":");
    const project = projects.find((p) => p.id === applyProjectId);

    try {
      await applyTemplate.mutateAsync({
        template: selected,
        entityId,
        entityType: entityType as "shot" | "asset",
        departmentNameById: Object.fromEntries(
          departments.map((d) => [d.id, d.name]),
        ),
      });
      setJustApplied(true);
      toast({
        title: "Template applied",
        description: `Added ${selected.items.length} tasks from "${selected.name}" to ${project?.name ?? "the project"}.`,
      });
    } catch (err) {
      fail("Could not apply template")(err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Template list */}
      <div className="space-y-3">
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button
            onClick={handleCreate}
            disabled={createTemplate.isPending}
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
                const hours = tmpl.items.reduce(
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
                              {tmpl.items.length} tasks
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

        {isLoading && (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading templates…
          </div>
        )}

        {!isLoading && templates.length === 0 && (
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
            <TemplateMetaCard
              template={selected}
              totalHours={totalHours}
              onUpdate={(updates) =>
                updateTemplate
                  .mutateAsync({ id: selected.id, ...updates })
                  .catch(fail("Could not save template"))
              }
              onApply={openApplyDialog}
            />

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
                      disabled={createItem.isPending}
                      onClick={() =>
                        createItem
                          .mutateAsync({
                            templateId: selected.id,
                            title: "New Task",
                          })
                          .catch(fail("Could not add task"))
                      }
                    >
                      <Plus className="w-3 h-3" /> Add Task
                    </Button>
                  </motion.div>
                </div>

                {selected.items.length === 0 ? (
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
                      items={selected.items.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        <AnimatePresence initial={false}>
                          {selected.items.map((task) => (
                            <TemplateTaskRow
                              key={task.id}
                              task={task}
                              departments={departments}
                              onUpdate={(updates) =>
                                updateItem
                                  .mutateAsync({
                                    templateId: selected.id,
                                    itemId: task.id,
                                    ...updates,
                                  })
                                  .catch(fail("Could not save task"))
                              }
                              onRemove={() =>
                                deleteItem
                                  .mutateAsync({
                                    templateId: selected.id,
                                    itemId: task.id,
                                  })
                                  .catch(fail("Could not remove task"))
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
              This creates {selected?.items.length ?? 0} new tasks, pre-filled
              with each task's department, estimated hours, and priority from
              this template. Tasks belong to a shot or an asset, so pick the one
              the bundle should land on.
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
                    onValueChange={(v) => {
                      setApplyProjectId(v);
                      setApplyEntity("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a project…" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Shot or asset
                  </span>
                  <Select
                    value={applyEntity}
                    onValueChange={setApplyEntity}
                    disabled={!applyProjectId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a shot or asset…" />
                    </SelectTrigger>
                    <SelectContent>
                      {shots.map((s) => (
                        <SelectItem key={s.id} value={`shot:${s.id}`}>
                          Shot · {s.name}
                        </SelectItem>
                      ))}
                      {assets.map((a) => (
                        <SelectItem key={a.id} value={`asset:${a.id}`}>
                          Asset · {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {applyProjectId &&
                    shots.length === 0 &&
                    assets.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        This project has no shots or assets yet.
                      </p>
                    )}
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
                  {selected?.items.length ?? 0} tasks added to{" "}
                  {projects.find((p) => p.id === applyProjectId)?.name}
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
                  disabled={!applyEntity || applyTemplate.isPending}
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
