import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess } from "../middleware/rbac";
import { getVisibilityScope } from "../lib/visibilityScope";
import {
  openShift,
  closeShift,
  sweepStaleShifts,
  studioDate,
} from "../lib/attendance";

export const attendanceRouter = Router();

attendanceRouter.use(tenantAuthMiddleware);
// Attendance is internal employment data with no client-facing equivalent.
attendanceRouter.use(denyClientAccess);

/** Default report window when the caller names neither end. */
const DEFAULT_WINDOW_DAYS = 14;

function isoDaysAgo(days: number): string {
  return studioDate(new Date(Date.now() - days * 86_400_000));
}

/**
 * Which users this caller may read attendance for.
 *
 * Deliberately reuses the same visibility scope every other list endpoint
 * obeys rather than inventing a second rule: an artist sees only their own
 * hours, a lead their department's, a producer/production head/admin the
 * studio's. Attendance is personal data, and a second definition of "who may
 * see whom" is a second place for it to drift wrong.
 */
async function readableUserIds(
  tenantId: string,
  scope: Awaited<ReturnType<typeof getVisibilityScope>>,
): Promise<string[] | null> {
  if (scope.kind === "all") return null; // null means "no restriction"
  if (scope.kind === "own") return [scope.userId];

  const peers = await prisma.user.findMany({
    where: { tenantId, departmentId: scope.departmentId, deletedAt: null },
    select: { id: true },
  });
  // A lead's own row may sit outside the department (leads are sometimes
  // filed under Production Management), so it is added explicitly.
  return Array.from(new Set([...peers.map((p) => p.id), scope.userId]));
}

/**
 * GET /api/attendance
 *
 * Raw shift rows for the window, scoped to what the caller may see.
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=` all narrow it further; a narrowing
 * filter can never widen the scope, because it is intersected with it.
 */
attendanceRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Swept before reading so an unclosed laptop-lid shift is already bounded
    // rather than reporting as a 60-hour day.
    await sweepStaleShifts(tenantId);

    const scope = await getVisibilityScope(req);
    const allowed = await readableUserIds(tenantId, scope);

    const from =
      typeof req.query.from === "string"
        ? req.query.from
        : isoDaysAgo(DEFAULT_WINDOW_DAYS);
    const to = typeof req.query.to === "string" ? req.query.to : studioDate();
    const requestedUser =
      typeof req.query.userId === "string" ? req.query.userId : null;

    if (requestedUser && allowed && !allowed.includes(requestedUser)) {
      return res.status(403).json({ error: "Not permitted" });
    }

    const rows = await prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        date: { gte: from, lte: to },
        ...(requestedUser
          ? { userId: requestedUser }
          : allowed
            ? { userId: { in: allowed } }
            : {}),
      },
      orderBy: [{ date: "desc" }, { clockInAt: "desc" }],
      take: 2000,
    });

    return res.json({ from, to, records: rows });
  } catch (err) {
    req.log.error(err, "Failed to read attendance");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/attendance/summary
 *
 * Per-person roll-up for the window: days present, total minutes, average day
 * length, and whether they are clocked in right now. This is the shape the
 * attendance screen actually renders, computed in one pass here rather than
 * shipping every raw row to the browser to be grouped there.
 */
attendanceRouter.get("/summary", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    await sweepStaleShifts(tenantId);

    const scope = await getVisibilityScope(req);
    const allowed = await readableUserIds(tenantId, scope);

    const from =
      typeof req.query.from === "string"
        ? req.query.from
        : isoDaysAgo(DEFAULT_WINDOW_DAYS);
    const to = typeof req.query.to === "string" ? req.query.to : studioDate();

    const rows = await prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        date: { gte: from, lte: to },
        ...(allowed ? { userId: { in: allowed } } : {}),
      },
      select: {
        userId: true,
        date: true,
        minutes: true,
        clockOutAt: true,
        closedBy: true,
      },
    });

    const byUser = new Map<
      string,
      {
        days: Set<string>;
        minutes: number;
        openShift: boolean;
        inferredDays: number;
      }
    >();
    for (const r of rows) {
      const entry =
        byUser.get(r.userId) ??
        { days: new Set<string>(), minutes: 0, openShift: false, inferredDays: 0 };
      entry.days.add(r.date);
      entry.minutes += r.minutes ?? 0;
      if (!r.clockOutAt) entry.openShift = true;
      if (r.closedBy === "auto") entry.inferredDays += 1;
      byUser.set(r.userId, entry);
    }

    const users = await prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(allowed ? { id: { in: allowed } } : {}),
      },
      select: {
        id: true,
        name: true,
        departmentId: true,
        punchedInAt: true,
        role: { select: { name: true } },
      },
    });

    const summary = users
      // admin and client keep no timesheet, so listing them with a permanent
      // zero would read as absence rather than "not applicable".
      .filter((u) => u.role.name !== "admin" && u.role.name !== "client")
      .map((u) => {
        const e = byUser.get(u.id);
        const days = e?.days.size ?? 0;
        const minutes = e?.minutes ?? 0;
        return {
          userId: u.id,
          name: u.name,
          role: u.role.name,
          departmentId: u.departmentId,
          daysPresent: days,
          totalMinutes: minutes,
          averageMinutesPerDay: days > 0 ? Math.round(minutes / days) : 0,
          clockedInNow: Boolean(u.punchedInAt) || Boolean(e?.openShift),
          /// Shifts closed by the sweep rather than a real sign-out. Surfaced
          /// so a reader knows which totals are estimates.
          inferredDays: e?.inferredDays ?? 0,
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    return res.json({ from, to, summary });
  } catch (err) {
    req.log.error(err, "Failed to summarise attendance");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/attendance/clock-in and /clock-out
 *
 * The manual equivalents of what login and logout do automatically, for the
 * normal cases automation cannot cover: arriving before opening the portal,
 * or staying signed in past the end of a shift. Always act on the caller's
 * own record -- punching someone else in is a payroll problem, not a feature.
 */
attendanceRouter.post("/clock-in", async (req, res) => {
  try {
    await openShift(req.tenantId!, req.userId!, "manual");
    return res.status(200).json({ message: "Clocked in" });
  } catch (err) {
    req.log.error(err, "Manual clock-in failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

attendanceRouter.post("/clock-out", async (req, res) => {
  try {
    await closeShift(req.tenantId!, req.userId!, "manual");
    await prisma.user.updateMany({
      where: { id: req.userId!, tenantId: req.tenantId!, punchedInAt: { not: null } },
      data: { punchedInAt: null },
    });
    return res.status(200).json({ message: "Clocked out" });
  } catch (err) {
    req.log.error(err, "Manual clock-out failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});
