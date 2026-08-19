import { useTasksStore } from '@/store/tasks';
import { DailyLog } from '@/data/mockData';

/**
 * Timesheets used to be backed by its own independent, persisted `TimeLog[]`
 * store that could drift out of sync with the daily logs written from
 * TaskDrawer (Task.dailyLogs/actualHours in store/tasks.ts). Task.dailyLogs
 * is the single canonical source of logged time now — this file is just a
 * flat, timesheet-shaped read/write view over it, so the Timesheets page can
 * never disagree with TaskDrawer's numbers again.
 */
export interface TimeLog {
  /** `${taskId}::${index into that task's dailyLogs array}` — not a persisted id of its own. */
  id: string;
  taskId: string;
  userId: string;
  date: string;
  hours: number;
  notes: string;
}

function toTimeLog(taskId: string, index: number, log: DailyLog): TimeLog {
  return {
    id: `${taskId}::${index}`,
    taskId,
    userId: log.userId,
    date: log.date,
    hours: log.hours,
    notes: log.note,
  };
}

function parseLogId(id: string): { taskId: string; index: number } | null {
  const sep = id.lastIndexOf('::');
  if (sep === -1) return null;
  const index = Number(id.slice(sep + 2));
  if (Number.isNaN(index)) return null;
  return { taskId: id.slice(0, sep), index };
}

/**
 * Reactive, derived view of every task's dailyLogs, timesheet-shaped. Holds
 * no state of its own — it re-derives from useTasksStore on every render, so
 * it always reflects exactly what TaskDrawer shows for the same task.
 */
export function useTimesheetLogs(): TimeLog[] {
  const tasks = useTasksStore((state) => state.tasks);
  return tasks.flatMap((task) => task.dailyLogs.map((log, index) => toTimeLog(task.id, index, log)));
}

/** Appends a new daily log entry to a task's canonical dailyLogs + actualHours. */
export function addTimeLog(input: { taskId: string; userId: string; date: string; hours: number; notes: string }): void {
  const { taskId, userId, date, hours, notes } = input;
  const newLog: DailyLog = { date, hours, note: notes, userId };
  useTasksStore.getState().logTime(taskId, newLog);
}

/** Edits one previously logged entry in place and reconciles the task's actualHours. */
export function updateTimeLog(id: string, updates: Partial<Pick<TimeLog, 'date' | 'hours' | 'notes'>>): void {
  const parsed = parseLogId(id);
  if (!parsed) return;
  useTasksStore.getState().updateDailyLog(parsed.taskId, parsed.index, {
    date: updates.date,
    hours: updates.hours,
    note: updates.notes,
  });
}

/** Removes one previously logged entry and reconciles the task's actualHours. */
export function deleteTimeLog(id: string): void {
  const parsed = parseLogId(id);
  if (!parsed) return;
  useTasksStore.getState().deleteDailyLog(parsed.taskId, parsed.index);
}
