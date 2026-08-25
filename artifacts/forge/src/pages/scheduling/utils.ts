// Shared date + timeline helpers for the Scheduling section (Team Board,
// Team Calendar, Capacity Forecast). All views share one reference window so
// drag-reschedule, leave blocks and forecast buckets stay aligned.

// Fixed reference date matching the rest of our mock data.
export const REFERENCE_DATE = new Date("2025-06-01");
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

// A mocked task duration/start-date since Task only carries a dueDate.
export const getTaskWindow = (task: { id: string; dueDate: string }) => {
  const duration = Math.max(
    3,
    (task.id.charCodeAt(task.id.length - 1) % 10) + 1,
  );
  const startDate = addDays(task.dueDate, -duration);
  return { startDate, duration };
};

export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
