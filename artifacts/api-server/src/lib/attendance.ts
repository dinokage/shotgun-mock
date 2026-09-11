import { prisma } from "@workspace/db";
import * as crypto from "crypto";

/**
 * Durable attendance history.
 *
 * `User.punchedInAt` answers only "is this person clocked in right now" -- it
 * is overwritten by the next punch and set back to null on sign-out, so every
 * completed shift used to vanish the moment it ended. These helpers write the
 * shift itself to `attendance_records`, which is append-only, so a lead or an
 * administrator can ask what hours someone actually worked.
 *
 * Both functions are best-effort by contract: attendance must never be the
 * reason a sign-in or sign-out fails. Callers log and continue.
 */

/**
 * The studio's local calendar date for an instant.
 *
 * Attendance is a human-calendar fact, not a UTC one: a 9pm shift in Vizag is
 * already "tomorrow" in UTC, and a report that files it under the wrong day is
 * wrong in the only way that matters to the person being paid. ATTENDANCE_TZ
 * is an IANA zone name; it defaults to the studio's own timezone rather than
 * the container's, which in Docker is always UTC.
 */
export function studioDate(at: Date = new Date()): string {
  const tz = process.env.ATTENDANCE_TZ || "Asia/Kolkata";
  try {
    // en-CA formats as YYYY-MM-DD, which is the format we want to store.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    // An invalid ATTENDANCE_TZ must not take sign-in down with it.
    return at.toISOString().slice(0, 10);
  }
}

/**
 * Opens a shift, unless one is already open.
 *
 * Idempotent for the same reason the `punchedInAt` guard is: signing in again
 * from a second machine, or after a browser restart, is the same shift. A new
 * row there would double-count the day's hours.
 */
export async function openShift(
  tenantId: string,
  userId: string,
  source: "login" | "manual" = "login",
): Promise<void> {
  const existing = await prisma.attendanceRecord.findFirst({
    where: { tenantId, userId, clockOutAt: null },
    select: { id: true },
  });
  if (existing) return;

  const now = new Date();
  await prisma.attendanceRecord.create({
    data: {
      id: crypto.randomUUID(),
      tenantId,
      userId,
      date: studioDate(now),
      clockInAt: now,
      source,
    },
  });
}

/**
 * Closes the open shift, writing its duration.
 *
 * `minutes` is computed here rather than at read time so reports stay a plain
 * SUM. A shift that somehow has no open row is not an error -- an admin never
 * had one opened, and a second logout is a no-op.
 */
export async function closeShift(
  tenantId: string,
  userId: string,
  closedBy: "logout" | "manual" | "auto" = "logout",
): Promise<void> {
  const open = await prisma.attendanceRecord.findFirst({
    where: { tenantId, userId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
    select: { id: true, clockInAt: true },
  });
  if (!open) return;

  const now = new Date();
  await prisma.attendanceRecord.update({
    where: { id: open.id },
    data: {
      clockOutAt: now,
      closedBy,
      minutes: Math.max(
        0,
        Math.round((now.getTime() - open.clockInAt.getTime()) / 60000),
      ),
    },
  });
}

/**
 * Hard ceiling on an unclosed shift, in hours.
 *
 * People close the laptop without signing out, and an open row left running
 * would report a 60-hour Tuesday. Sweeping them shut at this age keeps the
 * totals believable; `closedBy: "auto"` marks them as inferred so a report can
 * show them as estimates rather than measurements.
 */
export const MAX_OPEN_SHIFT_HOURS = 16;

/**
 * Closes shifts that were never signed out of.
 *
 * Runs opportunistically rather than on a scheduler: called before any
 * attendance read, so the numbers a report shows are already swept. That
 * keeps it correct on a single container and on three behind the load
 * balancer alike, with no cron to own and no leader election to get wrong.
 */
export async function sweepStaleShifts(tenantId: string): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_OPEN_SHIFT_HOURS * 3600_000);
  const stale = await prisma.attendanceRecord.findMany({
    where: { tenantId, clockOutAt: null, clockInAt: { lt: cutoff } },
    select: { id: true, clockInAt: true },
  });
  for (const row of stale) {
    const closedAt = new Date(
      row.clockInAt.getTime() + MAX_OPEN_SHIFT_HOURS * 3600_000,
    );
    await prisma.attendanceRecord.update({
      where: { id: row.id },
      data: {
        clockOutAt: closedAt,
        closedBy: "auto",
        minutes: MAX_OPEN_SHIFT_HOURS * 60,
      },
    });
  }
}
