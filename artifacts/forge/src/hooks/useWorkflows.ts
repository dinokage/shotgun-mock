import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Node, Edge } from "@xyflow/react";
import { apiClient, apiFetch } from "@/lib/apiClient";

// --- Node contract -----------------------------------------------------
// Loosely modeled on ftrack's "Actions" pattern: a node subscribes to a
// discover condition (when does it fire / apply) and, when triggered,
// produces a Message / Form / Widget-like result. Execution itself is out
// of scope here - this only shapes the data the editor reads and writes.
export type WorkflowNodeKind = "trigger" | "condition" | "action";

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
}

export type WorkflowStatus = "active" | "draft" | "paused";

export interface WorkflowSummaryDTO {
  id: string;
  name: string;
  description: string;
  trigger: string;
  status: WorkflowStatus;
  nodeCount: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDTO extends WorkflowSummaryDTO {
  graph: WorkflowGraph;
}

export type WorkflowRunLogStatus = "success" | "info" | "error" | "warning";

export interface WorkflowRunLogEntry {
  timestamp: string;
  node: string;
  message: string;
  status: WorkflowRunLogStatus;
}

export interface WorkflowRunDTO {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed" | "paused";
  currentNode: string;
  entityId: string | null;
  triggeredById: string | null;
  triggeredByName: string | null;
  startedAt: string;
  completedAt: string | null;
  logs: WorkflowRunLogEntry[];
}

export interface WorkflowWriteBody {
  name?: string;
  description?: string;
  trigger?: string;
  status?: WorkflowStatus;
  graph?: WorkflowGraph;
}

export function useWorkflows() {
  return useQuery<WorkflowSummaryDTO[]>({
    queryKey: ["workflows"],
    queryFn: () => apiFetch<WorkflowSummaryDTO[]>("/workflows"),
    staleTime: 30000,
  });
}

export function useWorkflow(id: string | undefined) {
  return useQuery<WorkflowDTO>({
    queryKey: ["workflow", id ?? "none"],
    queryFn: () => apiFetch<WorkflowDTO>(`/workflows/${id}`),
    enabled: !!id,
    staleTime: 30000,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkflowWriteBody & { name: string }) =>
      apiClient.post<WorkflowDTO>("/workflows", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

// The graph is a single document server-side: a save sends the whole node and
// edge set the editor currently holds, never a delta.
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: WorkflowWriteBody & { id: string }) =>
      apiClient.patch<WorkflowDTO>(`/workflows/${id}`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(["workflow", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/workflows/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

export function useWorkflowRuns(workflowId: string | undefined) {
  return useQuery<WorkflowRunDTO[]>({
    queryKey: ["workflow-runs", workflowId ?? "none"],
    queryFn: () => apiFetch<WorkflowRunDTO[]>(`/workflows/${workflowId}/runs`),
    enabled: !!workflowId,
    staleTime: 15000,
  });
}

// Approving or rejecting a gate is a persisted mutation on the run itself, so
// the outcome survives a refresh and is the same for every reviewer.
export function useWorkflowRunDecision(workflowId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      runId,
      decision,
      reason,
    }: {
      runId: string;
      decision: "approve" | "reject";
      reason?: string;
    }) =>
      apiClient.post<WorkflowRunDTO>(`/workflows/${workflowId}/runs/${runId}/decision`, {
        decision,
        reason,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workflow-runs", workflowId ?? "none"] }),
  });
}
