import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListOrdered, Plus, RotateCcw, Save, Unlink } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCapability } from "@/hooks/use-capability";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useBindProjectPipeline,
  usePipelineTemplates,
  useProjectPipeline,
  useUnbindProjectPipeline,
  useUpdateProjectPipeline,
  type ResolvedPipelineStageDTO,
  type ResolvedProjectPipelineDTO,
  type StageOverride,
} from "@/hooks/usePipelines";

type DraftStage = ResolvedPipelineStageDTO;

function templateOrder(stages: DraftStage[]) {
  return [...stages].sort(
    (a, b) => a.templateSortOrder - b.templateSortOrder || a.id.localeCompare(b.id),
  );
}

function sameOrder(a: DraftStage[], b: DraftStage[]) {
  return a.length === b.length && a.every((stage, i) => stage.id === b[i].id);
}

// Overrides are written only where the project genuinely diverges: an order
// identical to the template's own writes no sortOrder at all, so a later
// template reorder still flows through to this project. Once the producer
// does reorder, every stage is pinned -- a partial pin would leave the
// untouched stages sorting against pinned neighbours unpredictably.
function buildOverrides(draft: DraftStage[]): Record<string, StageOverride> {
  const diverged = !sameOrder(draft, templateOrder(draft));
  const overrides: Record<string, StageOverride> = {};
  draft.forEach((stage, index) => {
    const entry: StageOverride = {};
    if (diverged) entry.sortOrder = index;
    if (!stage.enabled) entry.enabled = false;
    if (entry.sortOrder !== undefined || entry.enabled !== undefined)
      overrides[stage.id] = entry;
  });
  return overrides;
}

function StageRow({
  stage,
  position,
  canManage,
  onToggle,
}: {
  stage: DraftStage;
  position: number;
  canManage: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
    disabled: !canManage,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5",
        !stage.enabled && "opacity-60 border-dashed",
      )}
    >
      {canManage ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${stage.name}`}
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing outline-none"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      ) : (
        <div className="w-4" />
      )}

      <span className="w-6 shrink-0 text-xs font-mono text-muted-foreground tabular-nums">
        {position}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold leading-tight">{stage.name}</span>
          <span className="text-[10px] font-mono text-muted-foreground">{stage.shortCode}</span>
          {stage.isOptional && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Optional
            </Badge>
          )}
          {stage.overridden && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Customised
            </Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span>{stage.department?.name ?? "Unassigned department"}</span>
          {stage.outputFormats.length > 0 && (
            <span className="font-mono">{stage.outputFormats.join(" · ")}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">
          {stage.taskCount} {stage.taskCount === 1 ? "task" : "tasks"}
        </span>
        {/* Only optional stages can be switched off -- a required stage is
            part of the discipline's pipeline, not a per-project choice. */}
        <Switch
          checked={stage.enabled}
          disabled={!canManage || !stage.isOptional}
          onCheckedChange={onToggle}
          aria-label={`${stage.enabled ? "Disable" : "Enable"} ${stage.name}`}
        />
      </div>
    </div>
  );
}

function PipelineBoard({
  pipeline,
  projectId,
  canManage,
}: {
  pipeline: ResolvedProjectPipelineDTO;
  projectId: string;
  canManage: boolean;
}) {
  const [draft, setDraft] = useState<DraftStage[]>(pipeline.stages);
  const { toast } = useToast();
  const updatePipeline = useUpdateProjectPipeline(projectId);
  const unbindPipeline = useUnbindProjectPipeline(projectId);

  // Server data is the source of truth between edits -- resync whenever a
  // refetch (or another producer's save) changes the resolved list.
  useEffect(() => setDraft(pipeline.stages), [pipeline.stages]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const isDirty = useMemo(
    () =>
      !sameOrder(draft, pipeline.stages) ||
      draft.some((s) => pipeline.stages.find((o) => o.id === s.id)?.enabled !== s.enabled),
    [draft, pipeline.stages],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((current) => {
      const from = current.findIndex((s) => s.id === active.id);
      const to = current.findIndex((s) => s.id === over.id);
      if (from < 0 || to < 0) return current;
      return arrayMove(current, from, to);
    });
  };

  const handleSave = () => {
    updatePipeline.mutate(
      { templateId: pipeline.templateId, stageOverrides: buildOverrides(draft) },
      {
        onSuccess: () =>
          toast({
            title: "Pipeline saved",
            description: `${pipeline.templateName} updated for this project.`,
          }),
        onError: (err: unknown) =>
          toast({
            title: "Could not save pipeline",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  // The server refuses (409) while any of this project's tasks still sit on
  // one of these stages, and says how many -- surface that message verbatim
  // rather than a generic failure, since it's the actionable part.
  const handleDetach = () => {
    unbindPipeline.mutate(pipeline.templateId, {
      onSuccess: () =>
        toast({
          title: "Pipeline detached",
          description: `${pipeline.templateName} is no longer used by this project.`,
        }),
      onError: (err: unknown) =>
        toast({
          title: "Could not detach pipeline",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        }),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{pipeline.templateName}</h3>
            <Badge variant="outline" className="uppercase text-[10px]">
              {pipeline.discipline}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {pipeline.entityKind === "shot" ? "Shots" : "Assets"}
            </Badge>
          </div>
          {pipeline.description && (
            <p className="text-sm text-muted-foreground mt-1">{pipeline.description}</p>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!isDirty || updatePipeline.isPending}
              onClick={() => setDraft(pipeline.stages)}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Discard
            </Button>
            <Button size="sm" disabled={!isDirty || updatePipeline.isPending} onClick={handleSave}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {updatePipeline.isPending ? "Saving…" : "Save order"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={unbindPipeline.isPending}
              onClick={handleDetach}
            >
              <Unlink className="w-3.5 h-3.5 mr-1.5" />
              {unbindPipeline.isPending ? "Detaching…" : "Detach"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draft.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {draft.map((stage, index) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  position={index + 1}
                  canManage={canManage}
                  onToggle={(enabled) =>
                    setDraft((current) =>
                      current.map((s) => (s.id === stage.id ? { ...s, enabled } : s)),
                    )
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  );
}

// A studio running 2D and VFX alongside 3D needs to be able to swap which
// discipline's pipeline a project follows, so every template the tenant has
// that isn't already bound here is offered.
function AttachPipeline({
  projectId,
  boundTemplateIds,
}: {
  projectId: string;
  boundTemplateIds: string[];
}) {
  const [selected, setSelected] = useState("");
  const { toast } = useToast();
  const { data: templates } = usePipelineTemplates();
  const bindPipeline = useBindProjectPipeline(projectId);

  const available = useMemo(
    () => (templates ?? []).filter((t) => !boundTemplateIds.includes(t.id)),
    [templates, boundTemplateIds],
  );
  if (available.length === 0) return null;

  const handleAttach = () => {
    const template = available.find((t) => t.id === selected);
    if (!template) return;
    bindPipeline.mutate(template.id, {
      onSuccess: () => {
        setSelected("");
        toast({
          title: "Pipeline attached",
          description: `${template.name} is now available on this project.`,
        });
      },
      onError: (err: unknown) =>
        toast({
          title: "Could not attach pipeline",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        }),
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Add a pipeline…" />
        </SelectTrigger>
        <SelectContent>
          {available.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name} · {template.stages.length} stages
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!selected || bindPipeline.isPending} onClick={handleAttach}>
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        {bindPipeline.isPending ? "Attaching…" : "Attach"}
      </Button>
    </div>
  );
}

export default function PipelineTab({ project }: { project: any }) {
  const projectId = project?.id as string | undefined;
  const canManage = useCapability("manage_pipeline");
  const { data, isLoading, error } = useProjectPipeline(projectId);

  if (isLoading)
    return <div className="p-6 text-center text-muted-foreground">Loading pipeline…</div>;
  if (error)
    return (
      <div className="p-6 text-center text-muted-foreground">Could not load this pipeline.</div>
    );

  const pipelines = data?.pipelines ?? [];
  const boundTemplateIds = pipelines.map((p) => p.templateId);

  return (
    <div className="flex flex-col gap-6 overflow-y-auto pb-8">
      <div className="flex items-start justify-between gap-4">
        {canManage ? (
          <p className="text-sm text-muted-foreground">
            Drag stages to reorder them for this project, and switch optional stages off. Changes
            apply to this project only — the shared template is untouched.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Read-only — changing this pipeline requires the Manage Pipeline permission.
          </p>
        )}
        {canManage && projectId && (
          <AttachPipeline projectId={projectId} boundTemplateIds={boundTemplateIds} />
        )}
      </div>

      {pipelines.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListOrdered />
            </EmptyMedia>
            <EmptyTitle>No pipeline attached</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Attach a pipeline template above to give this project a stage order."
                : "This project isn't using a pipeline template yet, so there are no stages to order."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        pipelines.map((pipeline) => (
          <PipelineBoard
            key={pipeline.projectPipelineId}
            pipeline={pipeline}
            projectId={projectId!}
            canManage={canManage}
          />
        ))
      )}
    </div>
  );
}
