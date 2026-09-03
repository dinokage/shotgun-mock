import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

// Real `tasksTable` field set (lib/db/src/schema/production.ts) — this is
// NOT the same shape as the mock `Task` interface in
// artifacts/forge/src/data/mockData.ts. In particular: there is no
// `assetId`/`shotId` pair (one `entityId`+`entityType` column pair covers
// both), no `assigneeId` (it's `assignedTo`), and no `assignedById` or
// `projectId` column at all. The five inline mock arrays (`checklist`,
// `comments`, `attachments`, `dependencies`, `approvalHistory`) are not
// present here either — they're separate nested-resource endpoints, each
// with its own hook pair below.
export interface TaskDTO {
  id: string;
  tenantId: string;
  entityId: string;
  entityType: "asset" | "shot";
  title: string;
  description: string;
  assignedTo: string | null;
  status: string;
  priority: string;
  department: string | null;
  pipelinePhase: string | null;
  weeklyRating: string | null;
  tags: string[];
  estimatedHours: number;
  actualHours: number;
  startDate: string | null;
  dueDate: string | null;
  lastStatusUpdate: string;
  createdAt: string;
}

// GET /api/tasks has no projectId query filter (see route comment in
// artifacts/api-server/src/routes/tasks.ts) — it returns all of the
// tenant's tasks unconditionally. A page that needs project-scoped tasks
// must filter client-side against useShots()/useAssets() data by matching
// entityId, not by passing a projectId here.
export function useTasks() {
  return useQuery<TaskDTO[]>({
    queryKey: ["tasks"],
    queryFn: async () => apiClient.get<TaskDTO[]>("/tasks"),
    staleTime: 10000,
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<TaskDTO>) =>
      apiClient.put<TaskDTO>(`/tasks/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

// ---------------------------------------------------------------------------
// Checklist — /tasks/:id/checklist
// ---------------------------------------------------------------------------

export interface TaskChecklistItemDTO {
  id: string;
  tenantId: string;
  taskId: string;
  text: string;
  done: boolean;
  position: number;
  createdAt: string;
}

export function useTaskChecklist(taskId: string | undefined) {
  return useQuery<TaskChecklistItemDTO[]>({
    queryKey: ["tasks", taskId ?? "none", "checklist"],
    queryFn: async () =>
      apiClient.get<TaskChecklistItemDTO[]>(`/tasks/${taskId}/checklist`),
    enabled: !!taskId,
    staleTime: 5000,
  });
}

export function useAddChecklistItem(taskId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; position?: number }) =>
      apiClient.post<TaskChecklistItemDTO>(
        `/tasks/${taskId}/checklist`,
        body,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["tasks", taskId ?? "none", "checklist"],
      }),
  });
}

export function useToggleChecklistItem(taskId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) =>
      apiClient.put<TaskChecklistItemDTO>(
        `/tasks/${taskId}/checklist/${itemId}`,
        { done },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["tasks", taskId ?? "none", "checklist"],
      }),
  });
}

// ---------------------------------------------------------------------------
// Comments — /tasks/:id/comments
// ---------------------------------------------------------------------------

export interface TaskCommentDTO {
  id: string;
  tenantId: string;
  taskId: string;
  userId: string;
  text: string;
  createdAt: string;
}

export function useTaskComments(taskId: string | undefined) {
  return useQuery<TaskCommentDTO[]>({
    queryKey: ["tasks", taskId ?? "none", "comments"],
    queryFn: async () =>
      apiClient.get<TaskCommentDTO[]>(`/tasks/${taskId}/comments`),
    enabled: !!taskId,
    staleTime: 5000,
  });
}

// Server infers the commenting user from the session (req.userId) — only
// `text` is accepted in the body.
export function useAddTaskComment(taskId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string }) =>
      apiClient.post<TaskCommentDTO>(`/tasks/${taskId}/comments`, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["tasks", taskId ?? "none", "comments"],
      }),
  });
}

// ---------------------------------------------------------------------------
// Dependencies — /tasks/:id/dependencies
// ---------------------------------------------------------------------------

export interface TaskDependencyDTO {
  id: string;
  tenantId: string;
  taskId: string;
  dependsOnTaskId: string;
  type: string;
  lagDays: number | null;
  createdAt: string;
}

export function useTaskDependencies(taskId: string | undefined) {
  return useQuery<TaskDependencyDTO[]>({
    queryKey: ["tasks", taskId ?? "none", "dependencies"],
    queryFn: async () =>
      apiClient.get<TaskDependencyDTO[]>(`/tasks/${taskId}/dependencies`),
    enabled: !!taskId,
    staleTime: 5000,
  });
}

export function useAddTaskDependency(taskId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      dependsOnTaskId: string;
      type?: string;
      lagDays?: number;
    }) =>
      apiClient.post<TaskDependencyDTO>(
        `/tasks/${taskId}/dependencies`,
        body,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["tasks", taskId ?? "none", "dependencies"],
      }),
  });
}

// ---------------------------------------------------------------------------
// Attachments — /tasks/:id/attachments
// ---------------------------------------------------------------------------

export interface TaskAttachmentDTO {
  id: string;
  tenantId: string;
  taskId: string;
  url: string;
  uploadedById: string;
  createdAt: string;
}

export function useTaskAttachments(taskId: string | undefined) {
  return useQuery<TaskAttachmentDTO[]>({
    queryKey: ["tasks", taskId ?? "none", "attachments"],
    queryFn: async () =>
      apiClient.get<TaskAttachmentDTO[]>(`/tasks/${taskId}/attachments`),
    enabled: !!taskId,
    staleTime: 5000,
  });
}

export function useAddTaskAttachment(taskId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string }) =>
      apiClient.post<TaskAttachmentDTO>(`/tasks/${taskId}/attachments`, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["tasks", taskId ?? "none", "attachments"],
      }),
  });
}

// ---------------------------------------------------------------------------
// Approval events — /tasks/:id/approval-events
// ---------------------------------------------------------------------------
// Append-only audit trail. The server infers `byUserId`/`byRole` from the
// caller's own session — never trust those from the client — so only
// `action` is accepted in the POST body. Recording an event does NOT also
// change the task's `status` server-side; callers that need both (e.g.
// approving moves a task to the next review stage) must call
// useUpdateTask().mutate({ id, status }) alongside this.

export interface TaskApprovalEventDTO {
  id: string;
  tenantId: string;
  taskId: string;
  action:
    | "submitted-for-lead-review"
    | "approved"
    | "changes-requested"
    | "rejected"
    | "published";
  byUserId: string;
  byRole: string;
  createdAt: string;
}

export function useTaskApprovalEvents(taskId: string | undefined) {
  return useQuery<TaskApprovalEventDTO[]>({
    queryKey: ["tasks", taskId ?? "none", "approval-events"],
    queryFn: async () =>
      apiClient.get<TaskApprovalEventDTO[]>(
        `/tasks/${taskId}/approval-events`,
      ),
    enabled: !!taskId,
    staleTime: 5000,
  });
}

export function useAddTaskApprovalEvent(taskId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: TaskApprovalEventDTO["action"] }) =>
      apiClient.post<TaskApprovalEventDTO>(
        `/tasks/${taskId}/approval-events`,
        body,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["tasks", taskId ?? "none", "approval-events"],
      }),
  });
}

// ---------------------------------------------------------------------------
// Daily logs — /daily-logs?taskId=... (top-level resource, not nested under
// /tasks/:id — see artifacts/api-server/src/routes/daily-logs.ts)
// ---------------------------------------------------------------------------

export interface DailyLogDTO {
  id: string;
  tenantId: string;
  taskId: string;
  userId: string;
  date: string;
  hours: number;
  note: string;
  createdAt: string;
}

export function useDailyLogs(taskId: string | undefined) {
  return useQuery<DailyLogDTO[]>({
    queryKey: ["daily-logs", taskId ?? "none"],
    queryFn: async () => apiClient.get<DailyLogDTO[]>(`/daily-logs?taskId=${taskId}`),
    enabled: !!taskId,
    staleTime: 5000,
  });
}

// Same shape as useDailyLogs, but filtered by userId instead of taskId —
// GET /daily-logs supports both query filters independently (see route).
// Used by pages that need one member's logged hours across all of their
// tasks (e.g. the Daily Standup payroll table) without fetching every
// task's logs individually.
export function useDailyLogsByUser(userId: string | undefined) {
  return useQuery<DailyLogDTO[]>({
    queryKey: ["daily-logs", "user", userId ?? "none"],
    queryFn: async () => apiClient.get<DailyLogDTO[]>(`/daily-logs?userId=${userId}`),
    enabled: !!userId,
    staleTime: 5000,
  });
}

// Studio-wide daily-log feed with no filter. GET /daily-logs only scopes by
// tenant when neither `taskId` nor `userId` is supplied (see the route in
// artifacts/api-server/src/routes/daily-logs.ts), so this mirrors useTasks()'s
// "fetch everything, filter client-side" pattern. Used by pages/timesheets.tsx,
// which needs to scope logged time across many tasks/users at once (an
// artist's own logs, or a manager's whole team's) rather than one task or one
// user at a time like useDailyLogs()/useDailyLogsByUser() above.
export function useAllDailyLogs() {
  return useQuery<DailyLogDTO[]>({
    queryKey: ["daily-logs", "all"],
    queryFn: async () => apiClient.get<DailyLogDTO[]>("/daily-logs"),
    staleTime: 10000,
  });
}

export function useAddDailyLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { taskId: string; date: string; hours: number; note?: string }) =>
      apiClient.post<DailyLogDTO>("/daily-logs", body),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["daily-logs", variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] }); // actualHours changed
    },
  });
}

// Editable only by whoever logged the hours (server-enforced) -- corrects a
// mislogged date/hours/note on an entry that already exists, re-rolling the
// task's actualHours by the delta rather than the absolute new value.
export function useUpdateDailyLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      date?: string;
      hours?: number;
      note?: string;
    }) => apiClient.put<DailyLogDTO>(`/daily-logs/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-logs"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] }); // actualHours changed
    },
  });
}

export function useDeleteDailyLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/daily-logs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-logs"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] }); // actualHours changed
    },
  });
}
