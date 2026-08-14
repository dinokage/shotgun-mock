import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Node, Edge } from '@xyflow/react';
import { WORKFLOWS } from '@/data/mockData';

// --- Node contract -----------------------------------------------------
// Loosely modeled on ftrack's "Actions" pattern: a node subscribes to a
// discover condition (when does it fire / apply) and, when triggered,
// produces a Message / Form / Widget-like result. Execution itself is out
// of scope here - this only shapes the data the editor reads and writes.
export type WorkflowNodeKind = 'trigger' | 'condition' | 'action';

export interface WorkflowNodeConfig {
  /** Human description of when this node fires/applies (the "discover" condition). */
  discover?: string;
  /** Trigger-only: the event this node listens for. */
  eventType?: string;
  /** Condition-only: the expression evaluated against the discover context. */
  expression?: string;
  /** Action-only: what the action does when triggered. */
  actionType?: string;
  /** Action-only: the shape of the result it returns (Message/Form/Widget). */
  resultType?: string;
}

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  /** Lucide icon name, looked up at render time - kept serializable for persistence. */
  icon: string;
  color: string;
  kind: WorkflowNodeKind;
  config: WorkflowNodeConfig;
}

export type WorkflowNode = Node<WorkflowNodeData>;

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: Edge[];
  updatedAt: string;
}

const edgeStyle = { strokeWidth: 2 };

// The original hand-authored example graph, now seeded as the persisted
// starting point for wf1 instead of being hardcoded into the page.
const EXAMPLE_GRAPH: WorkflowGraph = {
  nodes: [
    {
      id: 'trigger-1',
      type: 'custom',
      position: { x: 400, y: 50 },
      data: {
        label: 'Asset Created',
        description: 'Triggers when a new asset is added',
        icon: 'Play',
        color: 'green',
        kind: 'trigger',
        config: { discover: 'entity.type == "Asset"', eventType: 'Entity Created' },
      },
    },
    {
      id: 'action-1',
      type: 'custom',
      position: { x: 400, y: 200 },
      data: {
        label: 'Generate Proxy',
        description: 'Create lightweight USD proxy',
        icon: 'Box',
        color: 'blue',
        kind: 'action',
        config: { actionType: 'Run Script', resultType: 'Message' },
      },
    },
    {
      id: 'cond-1',
      type: 'custom',
      position: { x: 400, y: 350 },
      data: {
        label: 'Is Character?',
        description: 'Branch based on asset type',
        icon: 'Workflow',
        color: 'purple',
        kind: 'condition',
        config: { expression: 'asset.category == "character"' },
      },
    },
    {
      id: 'action-2a',
      type: 'custom',
      position: { x: 200, y: 500 },
      data: {
        label: 'Assign Rigging',
        description: 'Create rigging task',
        icon: 'UserPlus',
        color: 'orange',
        kind: 'action',
        config: { actionType: 'Update Entity', resultType: 'Form' },
      },
    },
    {
      id: 'action-2b',
      type: 'custom',
      position: { x: 600, y: 500 },
      data: {
        label: 'Assign Modeling',
        description: 'Create modeling task',
        icon: 'Paintbrush',
        color: 'orange',
        kind: 'action',
        config: { actionType: 'Update Entity', resultType: 'Form' },
      },
    },
    {
      id: 'action-3',
      type: 'custom',
      position: { x: 400, y: 650 },
      data: {
        label: 'Notify Supervisors',
        description: 'Send Slack alert',
        icon: 'Bell',
        color: 'pink',
        kind: 'action',
        config: { actionType: 'Send Notification', resultType: 'Message' },
      },
    },
    {
      id: 'action-4',
      type: 'custom',
      position: { x: 400, y: 800 },
      data: {
        label: 'Require Review',
        description: 'Auto-schedule initial review',
        icon: 'CheckSquare',
        color: 'cyan',
        kind: 'action',
        config: { actionType: 'Update Entity', resultType: 'Widget' },
      },
    },
  ],
  edges: [
    { id: 'e1-2', source: 'trigger-1', target: 'action-1', type: 'smoothstep', animated: true, style: edgeStyle },
    { id: 'e2-3', source: 'action-1', target: 'cond-1', type: 'smoothstep', animated: true, style: edgeStyle },
    { id: 'e3-4a', source: 'cond-1', target: 'action-2a', type: 'smoothstep', label: 'Yes', animated: true, style: { ...edgeStyle, stroke: '#f97316' } },
    { id: 'e3-4b', source: 'cond-1', target: 'action-2b', type: 'smoothstep', label: 'No', animated: true, style: { ...edgeStyle, stroke: '#f97316' } },
    { id: 'e4a-5', source: 'action-2a', target: 'action-3', type: 'smoothstep', animated: true, style: edgeStyle },
    { id: 'e4b-5', source: 'action-2b', target: 'action-3', type: 'smoothstep', animated: true, style: edgeStyle },
    { id: 'e5-6', source: 'action-3', target: 'action-4', type: 'smoothstep', animated: true, style: edgeStyle },
  ],
  updatedAt: new Date(0).toISOString(),
};

/** Minimal starter graph for any workflow that hasn't been custom-built yet. */
function createDefaultGraph(workflowId: string): WorkflowGraph {
  const meta = WORKFLOWS.find((wf) => wf.id === workflowId);
  return {
    nodes: [
      {
        id: `trigger-${workflowId}`,
        type: 'custom',
        position: { x: 360, y: 80 },
        data: {
          label: meta?.trigger ?? 'Manual Trigger',
          description: 'Starting point for this workflow',
          icon: 'Play',
          color: 'green',
          kind: 'trigger',
          config: { discover: 'entity.type == "Task"', eventType: meta?.trigger ?? 'Manual' },
        },
      },
    ],
    edges: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function seedGraphs(): Record<string, WorkflowGraph> {
  const seeded: Record<string, WorkflowGraph> = {};
  for (const wf of WORKFLOWS) {
    seeded[wf.id] = wf.id === 'wf1' ? EXAMPLE_GRAPH : createDefaultGraph(wf.id);
  }
  return seeded;
}

interface WorkflowsState {
  graphs: Record<string, WorkflowGraph>;
  /** Returns the persisted graph for a workflow, or a fresh default if none exists yet. */
  getGraph: (workflowId: string) => WorkflowGraph;
  /** Persists the current node/edge set for a workflow (used on every meaningful edit). */
  saveGraph: (workflowId: string, nodes: WorkflowNode[], edges: Edge[]) => void;
  /** Discards edits and restores the workflow's default starting graph. */
  resetGraph: (workflowId: string) => void;
}

export const useWorkflowsStore = create<WorkflowsState>()(
  persist(
    (set, get) => ({
      graphs: seedGraphs(),
      getGraph: (workflowId) => get().graphs[workflowId] ?? createDefaultGraph(workflowId),
      saveGraph: (workflowId, nodes, edges) =>
        set((state) => ({
          graphs: {
            ...state.graphs,
            [workflowId]: { nodes, edges, updatedAt: new Date().toISOString() },
          },
        })),
      resetGraph: (workflowId) =>
        set((state) => ({
          graphs: {
            ...state.graphs,
            [workflowId]: workflowId === 'wf1' ? EXAMPLE_GRAPH : createDefaultGraph(workflowId),
          },
        })),
    }),
    {
      name: 'forge-workflow-storage',
    }
  )
);
