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
  revokeAssignment: (id: string) => void;
  addComment: (taskId: string, userId: string, text: string) => void;
  toggleChecklistItem: (taskId: string, index: number) => void;
  /**
   * Single canonical mutation path for logged time — appends a DailyLog and
   * reconciles actualHours in one step. TaskDrawer's inline log form, the
   * TimeClockWidget punch-out flow, and the Timesheets page (via
   * store/timesheets.ts) all route through this instead of each hand-rolling
   * the same actualHours arithmetic against Task.dailyLogs independently.
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
            body: JSON.stringify(task),
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
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, assigneeId } : t,
          ),
        }));
        syncBackend(id, { assigneeId });
      },
      revokeAssignment: (id) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, assigneeId: "" } : t,
          ),
        }));
        syncBackend(id, { assigneeId: "" });
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
                  checklist: t.checklist.map((item, i) =>
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
                  dailyLogs: [...t.dailyLogs, log],
                  actualHours: t.actualHours + log.hours,
                }
              : t,
          ),
        }));
      },
      updateDailyLog: (taskId, index, updates) => {
        set((state) => ({
          tasks: state.tasks.map((t) => {
            if (t.id !== taskId || !t.dailyLogs[index]) return t;
            const oldHours = t.dailyLogs[index].hours;
            const nextLogs = t.dailyLogs.map((log, i) =>
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
            if (t.id !== taskId || !t.dailyLogs[index]) return t;
            const removedHours = t.dailyLogs[index].hours;
            return {
              ...t,
              dailyLogs: t.dailyLogs.filter((_, i) => i !== index),
              actualHours: t.actualHours - removedHours,
            };
          }),
        }));
      },
    }),
    {
      name: "forge-task-storage",
      version: 2,
      // Migrate tasks persisted before approvalHistory / checklist / comments /
      // dailyLogs were added — those fields will be undefined on old records,
      // causing .length crashes everywhere they're accessed.
      migrate(persistedState: unknown, fromVersion: number) {
        if (fromVersion < 2) {
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
