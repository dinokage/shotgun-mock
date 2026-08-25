import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  ConnectionLineType,
  Connection,
  Edge,
  NodeChange,
  NodeProps,
  Handle,
  Position,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNowStrict } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Play,
  Save,
  Workflow,
  Cog,
  Copy,
  Trash2,
  ArrowLeft,
  Paintbrush,
  Box,
  UserPlus,
  CheckSquare,
  Bell,
  Check,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { WORKFLOWS } from "@/data/mockData";
import { stagger } from "@/lib/motion";
import {
  useWorkflowsStore,
  type WorkflowNode as StoredWorkflowNode,
  type WorkflowNodeData,
  type WorkflowNodeKind,
} from "@/store/workflows";
import { useCapability } from "@/hooks/use-capability";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Icon names are persisted as strings (component references aren't
// serializable to localStorage), and resolved back to components here.
const ICON_MAP: Record<string, LucideIcon> = {
  Play,
  Box,
  Workflow,
  UserPlus,
  CheckSquare,
  Bell,
  Paintbrush,
  Cog,
};

interface PaletteItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  kind: WorkflowNodeKind;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    id: "trigger",
    label: "Start / Trigger",
    description: "Starting point for this workflow",
    icon: "Play",
    color: "green",
    kind: "trigger",
  },
  {
    id: "dept-stage",
    label: "Dept Stage (2D/3D/VFX)",
    description: "Create a department task stage",
    icon: "Box",
    color: "blue",
    kind: "action",
  },
  {
    id: "internal-review",
    label: "Internal Review",
    description: "Auto-schedule an internal review",
    icon: "CheckSquare",
    color: "purple",
    kind: "action",
  },
  {
    id: "client-feedback",
    label: "Client Feedback",
    description: "Request client feedback / approval",
    icon: "UserPlus",
    color: "orange",
    kind: "action",
  },
  {
    id: "branch",
    label: "Branch / Condition",
    description: "Branch based on a condition",
    icon: "Workflow",
    color: "cyan",
    kind: "condition",
  },
];

const DRAG_MIME = "application/forge-workflow-node";

function defaultConfigFor(kind: WorkflowNodeKind): WorkflowNodeData["config"] {
  switch (kind) {
    case "trigger":
      return { discover: 'entity.type == "Task"', eventType: "Entity Created" };
    case "condition":
      return { expression: 'asset.category == "character"' };
    case "action":
    default:
      return { actionType: "Run Script", resultType: "Message" };
  }
}

// Minimum on-canvas separation (px, in flow coordinates) between a newly
// placed node's center and any existing node's center before it's considered
// an overlap. Roughly matches the rendered node footprint (min-w-[180px]
// plus padding) so a fresh node can't land directly on top of - and hide -
// an existing one.
const NODE_COLLISION_RADIUS = 110;

/**
 * Given a desired drop position, returns a position that doesn't collide
 * with any existing node. If the desired spot is clear, it's returned
 * unchanged; otherwise this walks outward in a widening spiral (12 points
 * per ring) until it finds a clear spot.
 */
function resolveNonCollidingPosition(
  desired: { x: number; y: number },
  existingNodes: StoredWorkflowNode[],
  radius: number = NODE_COLLISION_RADIUS,
): { x: number; y: number } {
  const collides = (pos: { x: number; y: number }) =>
    existingNodes.some((n) => {
      const dx = n.position.x - pos.x;
      const dy = n.position.y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) < radius;
    });

  if (!collides(desired)) return desired;

  const pointsPerRing = 12;
  const angleStep = (Math.PI * 2) / pointsPerRing;
  const ringStep = radius * 0.85;
  for (let ring = 1; ring <= 24; ring++) {
    const ringRadius = ringStep * ring;
    for (let i = 0; i < pointsPerRing; i++) {
      const angle = angleStep * i;
      const candidate = {
        x: desired.x + Math.cos(angle) * ringRadius,
        y: desired.y + Math.sin(angle) * ringRadius,
      };
      if (!collides(candidate)) return candidate;
    }
  }
  // Should be unreachable in practice, but guarantees termination with
  // something clearly offset from the original spot.
  return { x: desired.x + radius * 24, y: desired.y };
}

function createNodeFromPaletteItem(
  item: PaletteItem,
  position: { x: number; y: number },
): StoredWorkflowNode {
  return {
    id: `${item.kind}-${Math.random().toString(36).slice(2, 9)}`,
    type: "custom",
    position,
    data: {
      label: item.label,
      description: item.description,
      icon: item.icon,
      color: item.color,
      kind: item.kind,
      config: defaultConfigFor(item.kind),
    },
  };
}

// Custom Node Component ------------------------------------------------
const WorkflowNode = ({ data, selected }: NodeProps<StoredWorkflowNode>) => {
  const Icon = ICON_MAP[data.icon] ?? Cog;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={`px-4 py-3 shadow-md rounded-md bg-card border min-w-[180px] transition-colors ${
        selected ? "border-primary ring-2 ring-primary/40" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-16 !bg-primary/50 transition-transform hover:scale-125"
      />
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-6 h-6 rounded flex items-center justify-center bg-${data.color}-500/10 text-${data.color}-500`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="font-medium text-sm">{data.label}</div>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {data.description}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-16 !bg-primary transition-transform hover:scale-125"
      />
    </motion.div>
  );
};

const nodeTypes = { custom: WorkflowNode };

// Test Run (simulated dry-run) -----------------------------------------
interface TestRunStep {
  id: string;
  label: string;
  icon: string;
  color: string;
  kind: WorkflowNodeKind;
}

interface TestRunResult {
  hasTrigger: boolean;
  steps: TestRunStep[];
  unreachable: StoredWorkflowNode[];
}

/**
 * Walks the graph breadth-first from every trigger node, following edges in
 * source -> target order, to produce the sequence nodes would fire in. Any
 * node never reached this way (no trigger, or simply not wired up) is
 * flagged as unreachable rather than silently ignored.
 */
function simulateTestRun(
  nodes: StoredWorkflowNode[],
  edges: Edge[],
): TestRunResult {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue;
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const triggers = nodes.filter((n) => n.data.kind === "trigger");

  const visited = new Set<string>(triggers.map((n) => n.id));
  const queue = [...visited];
  const order: StoredWorkflowNode[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (node) order.push(node);
    for (const targetId of outgoing.get(id) ?? []) {
      if (!visited.has(targetId)) {
        visited.add(targetId);
        queue.push(targetId);
      }
    }
  }

  const unreachable = nodes.filter((n) => !visited.has(n.id));

  return {
    hasTrigger: triggers.length > 0,
    steps: order.map((n) => ({
      id: n.id,
      label: n.data.label,
      icon: n.data.icon,
      color: n.data.color,
      kind: n.data.kind,
    })),
    unreachable,
  };
}

function WorkflowEditorInner() {
  const [, routeParams] = useRoute("/workflows/:id");
  const isNewWorkflowRoute = routeParams?.id === "new";
  const routeWorkflowId =
    routeParams?.id && WORKFLOWS.some((wf) => wf.id === routeParams.id)
      ? routeParams.id
      : undefined;

  // /workflows/new must never resolve to an existing workflow's id. It
  // previously fell through to WORKFLOWS[0] ('wf1' - a real, live,
  // 342-run production graph) because 'new' doesn't match anything in
  // WORKFLOWS, and any edit here autosaves - silently corrupting wf1. Give
  // "new" its own throwaway id instead, generated once per mount so every
  // visit to /workflows/new starts a genuinely blank workflow.
  const [workflowId, setWorkflowId] = useState<string>(() =>
    isNewWorkflowRoute
      ? `wf-new-${Math.random().toString(36).slice(2, 9)}`
      : (routeWorkflowId ?? WORKFLOWS[0]?.id ?? "wf1"),
  );

  const getGraph = useWorkflowsStore((s) => s.getGraph);
  const saveGraph = useWorkflowsStore((s) => s.saveGraph);
  const resetGraphAction = useWorkflowsStore((s) => s.resetGraph);
  // Editing pipeline graphs (adding/moving/deleting nodes, wiring edges,
  // saving, resetting) is gated on manage_pipeline rather than left open to
  // anyone who can reach this (already leadership-only) route.
  const canManagePipeline = useCapability("manage_pipeline");

  // Seed React Flow's local state synchronously from the store so there's
  // no empty-canvas flash on first paint.
  const initialGraph = useMemo(() => getGraph(workflowId), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [nodes, setNodes, onNodesChangeBase] =
    useNodesState<StoredWorkflowNode>(initialGraph.nodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>(
    initialGraph.edges,
  );
  const [selectedNode, setSelectedNode] = useState<StoredWorkflowNode | null>(
    null,
  );
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    initialGraph.updatedAt && new Date(initialGraph.updatedAt).getTime() > 0
      ? new Date(initialGraph.updatedAt)
      : null,
  );
  const [justSaved, setJustSaved] = useState(false);
  const [testRunOpen, setTestRunOpen] = useState(false);
  const [testRunResult, setTestRunResult] = useState<TestRunResult | null>(
    null,
  );

  const reactFlowInstance = useReactFlow<StoredWorkflowNode, Edge>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const isFirstRunRef = useRef(true);
  const skipNextAutosaveRef = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentWorkflow = WORKFLOWS.find((wf) => wf.id === workflowId);
  // Not one of the seeded WORKFLOWS - either the /workflows/new draft, or a
  // workflow whose id no longer resolves. Drives the "Untitled Workflow"
  // label and its virtual entry in the workflow switcher below.
  const isNewWorkflow = !currentWorkflow;

  // Switch workflows: load its persisted (or freshly-seeded) graph.
  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    const graph = getGraph(workflowId);
    skipNextAutosaveRef.current = true;
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelectedNode(null);
    setLastSavedAt(
      graph.updatedAt && new Date(graph.updatedAt).getTime() > 0
        ? new Date(graph.updatedAt)
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Debounced autosave whenever the graph actually changes.
  //
  // Must stay gated on canManagePipeline: clicking a node to view it (always
  // allowed, even read-only - it's how the read-only sidebar gets populated)
  // runs a 'select' NodeChange through onNodesChange, which produces a new
  // `nodes` array reference even though nothing about the graph actually
  // changed. Without this guard that alone was enough to fire a real
  // saveGraph() - and bump "Saved just now" - for a viewer with no edit
  // rights, directly contradicting the "changes here won't be saved"
  // read-only notice shown in the header.
  useEffect(() => {
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (!canManagePipeline) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveGraph(workflowId, nodes, edges);
      setLastSavedAt(new Date());
    }, 500);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, canManagePipeline]);

  const onNodesChange = useCallback(
    (changes: NodeChange<StoredWorkflowNode>[]) => {
      onNodesChangeBase(changes);
      const removedIds = changes
        .filter((c) => c.type === "remove")
        .map((c) => c.id);
      if (removedIds.length) {
        setSelectedNode((prev) =>
          prev && removedIds.includes(prev.id) ? null : prev,
        );
      }
    },
    [onNodesChangeBase],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!canManagePipeline) return;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: `e-${params.source}-${params.target}-${Math.random().toString(36).slice(2, 7)}`,
            type: "smoothstep",
            animated: true,
            style: { strokeWidth: 2 },
          },
          eds,
        ),
      );
    },
    [canManagePipeline, setEdges],
  );

  // Shared by both the click-to-add and drag-and-drop placement paths, so
  // collision avoidance applies no matter how the node was placed.
  //
  // Also marks the new node `selected: true` (and clears any other node's
  // selection) so React Flow's own selection ring - which it manages
  // independently of our sidebar's selectedNode state, and normally keeps in
  // sync via its built-in click handling - actually points at the node the
  // sidebar is now showing settings for, instead of staying on whatever was
  // last clicked (or showing no ring at all).
  const addNodeAt = useCallback(
    (item: PaletteItem, flowPosition: { x: number; y: number }) => {
      if (!canManagePipeline) return;
      const position = resolveNonCollidingPosition(flowPosition, nodes);
      const node: StoredWorkflowNode = {
        ...createNodeFromPaletteItem(item, position),
        selected: true,
      };
      setNodes((nds) =>
        nds
          .map((n) => (n.selected ? { ...n, selected: false } : n))
          .concat(node),
      );
      setSelectedNode(node);
    },
    [canManagePipeline, nodes, setNodes],
  );

  const handlePaletteClick = useCallback(
    (item: PaletteItem) => {
      if (!canManagePipeline) return;
      const bounds = canvasRef.current?.getBoundingClientRect();
      const cascade = nodes.length % 6;
      const screenPoint = bounds
        ? {
            x: bounds.left + bounds.width / 2 + (cascade - 2.5) * 60,
            y: bounds.top + 140 + cascade * 30,
          }
        : { x: 400, y: 150 };
      const flowPosition = reactFlowInstance.screenToFlowPosition(screenPoint);
      addNodeAt(item, flowPosition);
    },
    [canManagePipeline, nodes.length, reactFlowInstance, addNodeAt],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, item: PaletteItem) => {
      if (!canManagePipeline) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
      e.dataTransfer.effectAllowed = "move";
    },
    [canManagePipeline],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canManagePipeline) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [canManagePipeline],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!canManagePipeline) return;
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      let item: PaletteItem;
      try {
        item = JSON.parse(raw);
      } catch (err) {
        console.warn("[workflow-editor] Ignored malformed drag payload:", err);
        return;
      }
      const flowPosition = reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      addNodeAt(item, flowPosition);
    },
    [canManagePipeline, reactFlowInstance, addNodeAt],
  );

  const updateSelectedNodeData = useCallback(
    (
      patch:
        | Partial<WorkflowNodeData>
        | ((prev: WorkflowNodeData) => Partial<WorkflowNodeData>),
    ) => {
      if (!canManagePipeline) return;
      setSelectedNode((prevSelected) => {
        if (!prevSelected) return prevSelected;
        const nextPatch =
          typeof patch === "function" ? patch(prevSelected.data) : patch;
        const nextData = { ...prevSelected.data, ...nextPatch };
        setNodes((nds) =>
          nds.map((n) =>
            n.id === prevSelected.id ? { ...n, data: nextData } : n,
          ),
        );
        return { ...prevSelected, data: nextData };
      });
    },
    [canManagePipeline, setNodes],
  );

  const updateSelectedNodeConfig = useCallback(
    (configPatch: Partial<WorkflowNodeData["config"]>) => {
      updateSelectedNodeData((prevData) => ({
        config: { ...prevData.config, ...configPatch },
      }));
    },
    [updateSelectedNodeData],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!canManagePipeline || !selectedNode) return;
    reactFlowInstance.deleteElements({ nodes: [{ id: selectedNode.id }] });
  }, [canManagePipeline, selectedNode, reactFlowInstance]);

  const handleDuplicateSelected = useCallback(() => {
    if (!canManagePipeline || !selectedNode) return;
    // selectedNode is a snapshot taken when the node was clicked - it goes
    // stale on drag, since dragging updates the node's position in `nodes`
    // via onNodesChange without ever re-firing onNodeClick. Duplicating off
    // selectedNode.position directly would offset the clone from where the
    // node used to be, not where it actually is now. Read the live node's
    // position out of `nodes` instead.
    const liveNode =
      nodes.find((n) => n.id === selectedNode.id) ?? selectedNode;
    const clone: StoredWorkflowNode = {
      ...liveNode,
      id: `${liveNode.data.kind}-${Math.random().toString(36).slice(2, 9)}`,
      position: { x: liveNode.position.x + 40, y: liveNode.position.y + 40 },
      // The clone, not the original, is what the sidebar is about to show -
      // select it (and deselect the original) so React Flow's selection ring
      // agrees with the sidebar instead of staying on the original node.
      selected: true,
    };
    setNodes((nds) =>
      nds
        .map((n) => (n.id === selectedNode.id ? { ...n, selected: false } : n))
        .concat(clone),
    );
    setSelectedNode(clone);
  }, [canManagePipeline, selectedNode, nodes, setNodes]);

  const handleSaveClick = useCallback(() => {
    if (!canManagePipeline) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveGraph(workflowId, nodes, edges);
    const now = new Date();
    setLastSavedAt(now);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1400);
  }, [canManagePipeline, saveGraph, workflowId, nodes, edges]);

  const handleTestRun = useCallback(() => {
    setTestRunResult(simulateTestRun(nodes, edges));
    setTestRunOpen(true);
  }, [nodes, edges]);

  const handleReset = useCallback(() => {
    if (!canManagePipeline) return;
    resetGraphAction(workflowId);
    const graph = getGraph(workflowId);
    skipNextAutosaveRef.current = true;
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelectedNode(null);
    setLastSavedAt(new Date());
  }, [
    canManagePipeline,
    resetGraphAction,
    getGraph,
    workflowId,
    setNodes,
    setEdges,
  ]);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 -ml-2">
            <Link href="/workflows">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-semibold text-sm">
                Department Pipeline Builder
              </h1>
              <select
                className="bg-muted text-xs px-2 py-1 rounded border border-border outline-none"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
              >
                {isNewWorkflow && (
                  <option value={workflowId}>
                    Untitled Workflow (unsaved)
                  </option>
                )}
                {WORKFLOWS.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name}
                  </option>
                ))}
              </select>
              <Badge
                variant="outline"
                className={`text-[9px] h-4 border-0 ${
                  currentWorkflow?.status === "active"
                    ? "bg-green-500/10 text-green-500"
                    : currentWorkflow?.status === "paused"
                      ? "bg-amber-500/10 text-amber-500"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {(currentWorkflow?.status ?? "draft").toUpperCase()}
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 h-3 timecode">
              {lastSavedAt
                ? `Saved ${formatDistanceToNowStrict(lastSavedAt, { addSuffix: true })}`
                : "Not saved yet"}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {!canManagePipeline && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="inline-flex items-center text-[11px] text-muted-foreground mr-1"
                  >
                    Read-only
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                  You don't have permission to manage pipelines - changes here
                  won't be saved.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleReset}
            disabled={!canManagePipeline}
          >
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleTestRun}
          >
            <Play className="w-4 h-4" /> Test Run
          </Button>
          <Button
            size="sm"
            className="gap-2 w-[136px] justify-center"
            onClick={handleSaveClick}
            disabled={!canManagePipeline}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={justSaved ? "saved" : "save"}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                {justSaved ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {justSaved ? "Saved" : "Save Workflow"}
              </motion.span>
            </AnimatePresence>
          </Button>
        </div>
      </div>

      <div className="flex-1 flex">
        <div
          ref={canvasRef}
          className="flex-1 relative bg-background/50"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChangeBase}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={{
              stroke: "hsl(var(--primary))",
              strokeWidth: 2.5,
            }}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { strokeWidth: 2 },
            }}
            nodesDraggable={canManagePipeline}
            nodesConnectable={canManagePipeline}
            edgesReconnectable={canManagePipeline}
            deleteKeyCode={canManagePipeline ? ["Backspace", "Delete"] : []}
            fitView
            className="bg-dot-pattern"
          >
            <Controls className="bg-card border-border fill-foreground" />
            <MiniMap
              className="bg-card border-border"
              nodeColor="#3b82f6"
              maskColor="rgba(0,0,0,0.5)"
            />
            <Background color="#555" gap={16} />

            <Panel
              position="top-left"
              className="bg-card/80 backdrop-blur-sm p-2 rounded-lg border border-border shadow-sm"
            >
              <div className="text-xs font-medium mb-2 px-1">
                Pipeline Nodes
              </div>
              <div className="text-[9px] text-muted-foreground mb-2 px-1">
                {canManagePipeline
                  ? "Drag onto canvas, or click to add"
                  : "You don't have permission to edit this pipeline"}
              </div>
              <div className="flex flex-col gap-1">
                {PALETTE_ITEMS.map((item) => {
                  const Icon = ICON_MAP[item.icon] ?? Cog;
                  return (
                    <motion.div
                      key={item.id}
                      whileHover={canManagePipeline ? { x: 2 } : undefined}
                      whileTap={canManagePipeline ? { scale: 0.96 } : undefined}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        draggable={canManagePipeline}
                        disabled={!canManagePipeline}
                        onDragStart={(e) => handleDragStart(e, item)}
                        onClick={() => handlePaletteClick(item)}
                        className={`justify-start gap-2 h-8 text-xs font-normal w-full ${canManagePipeline ? "cursor-grab active:cursor-grabbing" : ""} text-${item.color}-500`}
                      >
                        <Icon className="w-3.5 h-3.5" />{" "}
                        <span className="text-foreground">{item.label}</span>
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Configuration Sidebar */}
        <div className="w-80 border-l border-border bg-card flex flex-col z-10 shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            {selectedNode ? (
              <motion.div
                key={selectedNode.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Node Settings</h3>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Duplicate node"
                        onClick={handleDuplicateSelected}
                        disabled={!canManagePipeline}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        title="Delete node"
                        onClick={handleDeleteSelected}
                        disabled={!canManagePipeline}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 mt-2 capitalize"
                  >
                    {selectedNode.data.kind}
                  </Badge>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Node Name
                    </label>
                    <input
                      type="text"
                      disabled={!canManagePipeline}
                      className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-shadow disabled:opacity-60"
                      value={selectedNode.data.label}
                      onChange={(e) =>
                        updateSelectedNodeData({ label: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Description
                    </label>
                    <textarea
                      disabled={!canManagePipeline}
                      className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm h-20 resize-none outline-none focus:ring-1 focus:ring-primary transition-shadow disabled:opacity-60"
                      value={selectedNode.data.description}
                      onChange={(e) =>
                        updateSelectedNodeData({ description: e.target.value })
                      }
                    />
                  </div>

                  <div className="pt-4 border-t border-border">
                    <h4 className="text-sm font-medium mb-3">Configuration</h4>
                    <div className="space-y-3">
                      {selectedNode.data.kind === "trigger" && (
                        <>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground block">
                              Event Type
                            </label>
                            <select
                              disabled={!canManagePipeline}
                              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm outline-none disabled:opacity-60"
                              value={
                                selectedNode.data.config.eventType ??
                                "Entity Created"
                              }
                              onChange={(e) =>
                                updateSelectedNodeConfig({
                                  eventType: e.target.value,
                                })
                              }
                            >
                              <option>Status Changed</option>
                              <option>Entity Created</option>
                              <option>Schedule Reached</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground block">
                              Discover Condition
                            </label>
                            <input
                              type="text"
                              disabled={!canManagePipeline}
                              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary transition-shadow disabled:opacity-60"
                              value={selectedNode.data.config.discover ?? ""}
                              onChange={(e) =>
                                updateSelectedNodeConfig({
                                  discover: e.target.value,
                                })
                              }
                              placeholder='entity.type == "Task"'
                            />
                          </div>
                        </>
                      )}
                      {selectedNode.data.kind === "condition" && (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground block">
                            Condition Expression
                          </label>
                          <input
                            type="text"
                            disabled={!canManagePipeline}
                            className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary transition-shadow disabled:opacity-60"
                            value={selectedNode.data.config.expression ?? ""}
                            onChange={(e) =>
                              updateSelectedNodeConfig({
                                expression: e.target.value,
                              })
                            }
                            placeholder='asset.category == "character"'
                          />
                        </div>
                      )}
                      {selectedNode.data.kind === "action" && (
                        <>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground block">
                              Action Type
                            </label>
                            <select
                              disabled={!canManagePipeline}
                              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm outline-none disabled:opacity-60"
                              value={
                                selectedNode.data.config.actionType ??
                                "Run Script"
                              }
                              onChange={(e) =>
                                updateSelectedNodeConfig({
                                  actionType: e.target.value,
                                })
                              }
                            >
                              <option>Run Script</option>
                              <option>Send Notification</option>
                              <option>Update Entity</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground block">
                              Result Type
                            </label>
                            <select
                              disabled={!canManagePipeline}
                              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm outline-none disabled:opacity-60"
                              value={
                                selectedNode.data.config.resultType ?? "Message"
                              }
                              onChange={(e) =>
                                updateSelectedNodeConfig({
                                  resultType: e.target.value,
                                })
                              }
                            >
                              <option>Message</option>
                              <option>Form</option>
                              <option>Widget</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-muted/10 h-full"
              >
                <Cog className="w-10 h-10 opacity-20 mb-3" />
                <p className="text-sm">
                  Select a node to configure its properties
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Dialog open={testRunOpen} onOpenChange={setTestRunOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-4 h-4 text-primary" /> Test Run
            </DialogTitle>
            <DialogDescription>
              Simulated dry run of "{currentWorkflow?.name ?? "this workflow"}"
              — no real actions were executed.
            </DialogDescription>
          </DialogHeader>

          {testRunResult && !testRunResult.hasTrigger && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                No trigger node found — this workflow would never fire.
              </span>
            </div>
          )}

          {testRunResult && nodes.length === 0 && (
            <div className="text-xs text-muted-foreground">
              This workflow is empty — add nodes to test it.
            </div>
          )}

          {testRunResult && testRunResult.steps.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                Firing order
              </div>
              {testRunResult.steps.map((step, i) => {
                const Icon = ICON_MAP[step.icon] ?? Cog;
                return (
                  <motion.div
                    key={step.id}
                    {...stagger(i)}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                  >
                    <div className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">
                      {i + 1}
                    </div>
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center bg-${step.color}-500/10 text-${step.color}-500 shrink-0`}
                    >
                      <Icon className="w-3 h-3" />
                    </div>
                    <div className="text-xs font-medium truncate">
                      {step.label}
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[9px] h-4 ml-auto capitalize shrink-0"
                    >
                      {step.kind}
                    </Badge>
                  </motion.div>
                );
              })}
            </div>
          )}

          {testRunResult && testRunResult.unreachable.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
                <AlertTriangle className="w-3.5 h-3.5" /> Unreachable nodes
              </div>
              <div className="text-[11px] text-muted-foreground">
                Not connected to a trigger, so they would never fire:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {testRunResult.unreachable.map((n) => (
                  <Badge
                    key={n.id}
                    variant="outline"
                    className="text-[9px] h-5 border-amber-500/30 text-amber-500"
                  >
                    {n.data.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button size="sm" onClick={() => setTestRunOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner />
    </ReactFlowProvider>
  );
}
