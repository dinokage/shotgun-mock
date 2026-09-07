// Shared date + timeline helpers for the Scheduling section (Team Board,
// Team Calendar, Capacity Forecast). All views share one reference window so
// drag-reschedule, leave blocks and forecast buckets stay aligned.

// Start of the current week (Sunday, local time). Previously a hardcoded
// "2025-06-01" matching whatever date the mock data happened to be seeded
// against -- once real tasks with 2026+ dates replaced the mock array, that
// fixed date put every real task's window outside the 45-day timeline this
// anchors (CapacityForecast bucketed everything to 0% utilization,
// TeamCalendar pushed every bar ~450 days off-screen). Deriving it from
// "now" keeps the window aligned with whatever data is actually live.
function startOfWeek(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

export const REFERENCE_DATE = startOfWeek(new Date());
export const TIMELINE_DAYS = 45;

export const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

export const getDaysDiff = (start: string, end: string) => {
  const diffTime = Math.abs(
    new Date(end).getTime() - new Date(start).getTime(),
  );
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
};

// Number of whole days [a, b] overlap, inclusive on both ends. 0 if no overlap.
export const overlapDays = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) => {
  const start = Math.max(
    new Date(aStart).getTime(),
    new Date(bStart).getTime(),
  );
  const end = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  if (end < start) return 0;
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
};

// Real TaskDTOs now carry a genuine `startDate` (see TASK_PATCHABLE_FIELDS
// server-side) -- use it directly when present. Only fall back to fabricating
// a duration/start-date from the task id when `startDate` is missing (some
// tasks, especially older/legacy ones, genuinely have none).
export const getTaskWindow = (task: {
  id: string;
  dueDate: string;
  startDate?: string | null;
}) => {
  if (task.startDate) {
    return {
      startDate: task.startDate,
      duration: getDaysDiff(task.startDate, task.dueDate),
    };
  }
  const duration = Math.max(
    3,
    (task.id.charCodeAt(task.id.length - 1) % 10) + 1,
  );
  const startDate = addDays(task.dueDate, -duration);
  return { startDate, duration };
};

export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
