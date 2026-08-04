import { create } from 'zustand';
import { TASKS } from '@/data/mockData';

export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'complete' | 'blocked';

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string;
  assigneeId: string;
  priority: string;
  dueDate: string;
  estimatedHours: number;
  actualHours: number;
  tags: string[];
  dependencies: string[];
}

interface TasksState {
  tasks: Task[];
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  updateTaskDates: (id: string, newDate: string) => void;
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: TASKS as Task[],
  updateTaskStatus: (id, status) => 
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t))
    })),
  updateTaskDates: (id, newDate) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, dueDate: newDate } : t))
    }))
}));
