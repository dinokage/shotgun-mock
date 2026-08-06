import { create } from 'zustand';
import { Task, TaskStatus, TASKS } from '@/data/mockData';

interface TasksState {
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  updateTaskDates: (id: string, newDate: string) => void;
  updateTaskAssignee: (id: string, newAssigneeId: string) => void;
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: TASKS, // initialized with mockData TASKS
  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks]
    })),
  updateTaskStatus: (id, status) => 
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t))
    })),
  updateTaskDates: (id, newDate) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, dueDate: newDate } : t))
    })),
  updateTaskAssignee: (id, newAssigneeId) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, assigneeId: newAssigneeId } : t))
    })),
}));
