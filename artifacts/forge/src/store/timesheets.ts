import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TimeLog {
  id: string;
  taskId: string;
  userId: string;
  date: string;
  hours: number;
  notes: string;
}

const INITIAL_LOGS: TimeLog[] = [
  { id: 'log1', taskId: 't1', userId: 'u1', date: new Date().toISOString().split('T')[0], hours: 4, notes: 'Blocking animation' },
  { id: 'log2', taskId: 't2', userId: 'u1', date: new Date().toISOString().split('T')[0], hours: 3.5, notes: 'Initial lighting setup' },
];

interface TimesheetState {
  logs: TimeLog[];
  setLogs: (logs: TimeLog[]) => void;
  addLog: (log: TimeLog) => void;
  updateLog: (id: string, updates: Partial<TimeLog>) => void;
  deleteLog: (id: string) => void;
}

export const useTimesheetStore = create<TimesheetState>()(
  persist(
    (set) => ({
      logs: INITIAL_LOGS,
      setLogs: (logs) => set({ logs }),
      addLog: (log) => set((state) => ({ logs: [log, ...state.logs] })),
      updateLog: (id, updates) =>
        set((state) => ({
          logs: state.logs.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        })),
      deleteLog: (id) =>
        set((state) => ({
          logs: state.logs.filter((l) => l.id !== id),
        })),
    }),
    {
      name: 'forge-timesheet-storage',
    }
  )
);
