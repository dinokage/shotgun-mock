import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TASKS, Task, TaskStatus, ApprovalEvent } from '@/data/mockData';

interface TaskState {
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  updateTaskDates: (id: string, newDate: string) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  submitForReview: (id: string) => void;
  completeTask: (id: string) => void;
  reassignTask: (id: string, assigneeId: string) => void;
  revokeAssignment: (id: string) => void;
  addComment: (taskId: string, userId: string, text: string) => void;
  toggleChecklistItem: (taskId: string, index: number) => void;
  /**
   * Advances a task's multi-tier approval-chain status AND appends a
   * permanent, persisted audit-trail entry for the action taken (who, what,
   * when). This is what makes the Lead -> Supervisor -> Producer chain real
   * first-class state rather than transient UI-only stage tracking: both the
   * current stage (`status`) and the full history survive reload/navigation.
   */
  recordApprovalEvent: (id: string, status: TaskStatus, event: Omit<ApprovalEvent, 'id' | 'timestamp'>) => void;
}

export const useTasksStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: TASKS,
      setTasks: (tasks) => set({ tasks }),
      addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
      updateTaskDates: (id, newDate) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, dueDate: newDate } : t)),
        })),
      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
      updateTaskStatus: (id, status) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, status, lastStatusUpdate: new Date().toISOString() }
              : t
          ),
        })),
      submitForReview: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, status: 'review', lastStatusUpdate: new Date().toISOString() }
              : t
          ),
        })),
      completeTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, status: 'complete', lastStatusUpdate: new Date().toISOString() }
              : t
          ),
        })),
      reassignTask: (id, assigneeId) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, assigneeId } : t)),
        })),
      revokeAssignment: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, assigneeId: '' } : t)),
        })),
      addComment: (taskId, userId, text) =>
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
              : t
          ),
        })),
      toggleChecklistItem: (taskId, index) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  checklist: t.checklist.map((item, i) =>
                    i === index ? { ...item, done: !item.done } : item
                  ),
                }
              : t
          ),
        })),
      recordApprovalEvent: (id, status, event) =>
        set((state) => {
          const timestamp = new Date().toISOString();
          return {
            tasks: state.tasks.map((t) =>
              t.id === id
                ? {
                    ...t,
                    status,
                    lastStatusUpdate: timestamp,
                    approvalHistory: [
                      ...t.approvalHistory,
                      { ...event, id: `ae-${Date.now()}`, timestamp },
                    ],
                  }
                : t
            ),
          };
        }),
    }),
    {
      name: 'forge-task-storage',
    }
  )
);
