import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TASKS, Task, TaskStatus } from '@/data/mockData';

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
  addComment: (taskId: string, userId: string, text: string) => void;
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
    }),
    {
      name: 'forge-task-storage',
    }
  )
);
