import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  TASKS,
  Task,
  TaskStatus,
  ApprovalEvent,
  DailyLog,
} from "@/data/mockData";

interface TaskState {
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  updateTaskDates: (id: string, newDate: string) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  completeTask: (id: string) => void;
  reassignTask: (id: string, assigneeId: string) => void;
  claimTask: (id: string, userId: string) => void;
  revokeAssignment: (id: string) => void;
  addComment: (taskId: string, userId: string, text: string) => void;
  toggleChecklistItem: (taskId: string, index: number) => void;
  /**
   * Legacy client-only mutation path for logged time (appends a DailyLog and
   * reconciles actualHours in one step, purely in this Zustand store). Real
   * daily logs are now a backend resource (see hooks/useTasks.ts's
   * DailyLogDTO/useAddDailyLog) — TaskDrawer and pages/timesheets.tsx both
   * write through that instead, since this store's `tasks` get overwritten
   * with real, untranslated TaskDTO[] on login (no inline `dailyLogs` field
   * at all) and never sync back to the backend. Kept only in case another
   * legacy-mock-data call site still depends on it; has no consumers as of
   * this comment.
   */
  logTime: (taskId: string, log: DailyLog) => void;
  /** Edits one previously logged entry (by index) and reconciles actualHours. */
  updateDailyLog: (
    taskId: string,
    index: number,
    updates: Partial<DailyLog>,
  ) => void;
  /** Removes one previously logged entry (by index) and reconciles actualHours. */
  deleteDailyLog: (taskId: string, index: number) => void;
  /**
   * Advances a task's multi-tier approval-chain status AND appends a
   * permanent, persisted audit-trail entry for the action taken (who, what,
   * when). This is what makes the Lead -> Supervisor -> Producer chain real
   * first-class state rather than transient UI-only stage tracking: both the
   * current stage (`status`) and the full history survive reload/navigation.
   */
  recordApprovalEvent: (
    id: string,
    status: TaskStatus,
    event: Omit<ApprovalEvent, "id" | "timestamp">,
  ) => void;
} // Helper to lazily sync mutations to the backend without blocking the UI
const syncBackend = async (id: string, updates: any) => {
  try {
    const { apiFetch } = await import("@/lib/apiClient");
    await apiFetch(`/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  } catch (err) {
    console.error("Failed to sync task mutation to backend", err);
  }
};

export const useTasksStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: TASKS,
      setTasks: (tasks) => set({ tasks }),
      addTask: (task) => {
        set((state) => ({ tasks: [task, ...state.tasks] }));
        import("@/lib/apiClient").then(({ apiFetch }) => {
          apiFetch("/tasks", {
            method: "POST",
            body: JSON.stringify({
              entityId: task.assetId || task.shotId,
              entityType: task.assetId ? "asset" : "shot",
              status: task.status,
              title: task.title,
              description: task.description,
              priority: task.priority,
              department: task.department,
              pipelinePhase: task.pipelinePhase,
              dueDate: task.dueDate,
              estimatedHours: task.estimatedHours,
              assignedTo: task.assigneeId || null,
            }),
          }).catch(console.error);
        });
      },
      updateTaskDates: (id, newDate) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, dueDate: newDate } : t,
          ),
        }));
        syncBackend(id, { dueDate: newDate });
      },
      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates } : t,
          ),
        }));
        syncBackend(id, updates);
      },
      updateTaskStatus: (id, status) => {
        const lastStatusUpdate = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, status, lastStatusUpdate } : t,
          ),
        }));
        syncBackend(id, { status, lastStatusUpdate });
      },
      completeTask: (id) => {
        const lastStatusUpdate = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, status: "complete", lastStatusUpdate } : t,
          ),
        }));
        syncBackend(id, { status: "complete", lastStatusUpdate });
      },
      reassignTask: (id, assigneeId) => {
        // Post-login tasks are real, untranslated TaskDTO objects carrying
        // `assignedTo` (not `assigneeId`) -- every consumer's getAssigneeId
        // normalizer reads `t.assignedTo ?? t.assigneeId`, so patching only
        // `assigneeId` here left the optimistic update invisible: the
        // normalizer kept resolving to the original (truthy) `assignedTo`
        // value until a full reload re-hydrated the task. Setting both
        // keeps old-shape and new-shape readers correct simultaneously.
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, assigneeId, assignedTo: assigneeId || null }
              : t,
          ),
        }));
        syncBackend(id, { assignedTo: assigneeId || null });
      },
      claimTask: (id, userId) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, assigneeId: userId, assignedTo: userId }
              : t,
          ),
        }));
        syncBackend(id, { assignedTo: userId });
      },
      revokeAssignment: (id) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, assigneeId: "", assignedTo: null }
              : t,
          ),
        }));
        syncBackend(id, { assignedTo: null });
      },
      addComment: (taskId, userId, text) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: [
                    ...t.comments,
                    { userId, text, timestamp: new Date().toISOString() },
                  ],
                }
              : t,
          ),
        }));
      },
      toggleChecklistItem: (taskId, index) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  checklist: (t.checklist ?? []).map((item, i) =>
                    i === index ? { ...item, done: !item.done } : item,
                  ),
                }
              : t,
          ),
        }));
      },
      recordApprovalEvent: (id, status, event) => {
        const timestamp = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status,
                  lastStatusUpdate: timestamp,
                  approvalHistory: [
                    ...(t.approvalHistory ?? []),
                    { ...event, id: `ae-${Date.now()}`, timestamp },
                  ],
                }
              : t,
          ),
        }));
        syncBackend(id, { status, lastStatusUpdate: timestamp });
      },
      logTime: (taskId, log) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  dailyLogs: [...(t.dailyLogs ?? []), log],
                  actualHours: t.actualHours + log.hours,
                }
              : t,
          ),
        }));
      },
      updateDailyLog: (taskId, index, updates) => {
        set((state) => ({
          tasks: state.tasks.map((t) => {
            const logs = t.dailyLogs ?? [];
            if (t.id !== taskId || !logs[index]) return t;
            const oldHours = logs[index].hours;
            const nextLogs = logs.map((log, i) =>
              i === index ? { ...log, ...updates } : log,
            );
            const newHours = nextLogs[index].hours;
            return {
              ...t,
              dailyLogs: nextLogs,
              actualHours: t.actualHours - oldHours + newHours,
            };
          }),
        }));
      },
      deleteDailyLog: (taskId, index) => {
        set((state) => ({
          tasks: state.tasks.map((t) => {
            const logs = t.dailyLogs ?? [];
            if (t.id !== taskId || !logs[index]) return t;
            const removedHours = logs[index].hours;
            return {
              ...t,
              dailyLogs: logs.filter((_, i) => i !== index),
              actualHours: t.actualHours - removedHours,
            };
          }),
        }));
      },
    }),
    {
      name: "forge-task-storage",
      version: 3,
      // Migrate tasks persisted before approvalHistory / checklist / comments /
      // dailyLogs were added — those fields will be undefined on old records,
      // causing .length/.map crashes everywhere they're accessed. Bumped to 3
      // because some browsers had version-2-tagged state that still had gaps
      // (added via a path that predated the v2 migration's own introduction),
      // so a version check alone isn't sufficient — every consumption site
      // was also hardened with `?? []` as defense-in-depth.
      migrate(persistedState: unknown, fromVersion: number) {
        if (fromVersion < 3) {
          const state = persistedState as { tasks?: Task[] };
          if (Array.isArray(state?.tasks)) {
            state.tasks = state.tasks.map((t) => ({
              ...t,
              approvalHistory: t.approvalHistory ?? [],
              checklist: t.checklist ?? [],
              comments: t.comments ?? [],
              dailyLogs: t.dailyLogs ?? [],
            }));
          }
        }
        return persistedState as TaskState;
      },
    },
  ),
);
