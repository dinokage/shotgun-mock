import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

export const standupUpdatesRouter = Router();

// Mirrors STUDIO_LEADERSHIP_ROLES / DEPARTMENT_LEADERSHIP_ROLES in
// artifacts/forge/src/store/permissions.ts -- daily-standup.tsx already
// filters the feed by these exact groups, so scope the query the same way
// rather than shipping the whole studio's updates to an artist's browser.
const STUDIO_LEADERSHIP_ROLES = ["admin", "production_head"];
const DEPARTMENT_LEADERSHIP_ROLES = ["producer", "lead"];

// Both the daily-log `date` column and the frontend's own log-filing calls
// use a UTC YYYY-MM-DD string, so derive the task-activity window from that
// same boundary -- otherwise "tasks touched today" and "hours logged today"
// would disagree for anyone working near midnight.
function todayBounds() {
  const dateKey = new Date().toISOString().slice(0, 10);
  return {
    dateKey,
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`),
  };
}

/**
 * Builds a standup update out of what the user actually did today: tasks
 * assigned to them whose status moved today, plus the daily logs they filed.
 * Returns null when there is genuinely nothing to report -- the logout
 * handler posts nothing rather than an empty "no update" placeholder.
 */
export async function postAutoStandupUpdate(
  tenantId: string,
  userId: string,
): Promise<void> {
  const { dateKey, start, end } = todayBounds();

  const [touchedTasks, logs] = await Promise.all([
    prisma.task.findMany({
      where: {
        tenantId,
        assignedTo: userId,
        lastStatusUpdate: { gte: start, lte: end },
      },
      select: { id: true, title: true, status: true, lastStatusUpdate: true },
      orderBy: { lastStatusUpdate: "desc" },
    }),
    prisma.dailyLog.findMany({
      where: { tenantId, userId, date: dateKey },
      select: { taskId: true, hours: true, note: true },
    }),
  ]);

  if (touchedTasks.length === 0 && logs.length === 0) return;

  // An auto-post already exists for today (a second logout in the same day,
  // or a logout after the punch-out flow already ran) -- overwriting or
  // duplicating it would both be wrong, so leave the first one standing.
  const existingAuto = await prisma.standupUpdate.findFirst({
    where: {
      tenantId,
      userId,
      source: "auto",
      createdAt: { gte: start, lte: end },
    },
    select: { id: true },
  });
  if (existingAuto) return;

  const hours = logs.reduce((sum, log) => sum + log.hours, 0);
  const lines: string[] = [];

  if (touchedTasks.length > 0) {
    lines.push(
      `Worked on ${touchedTasks.length} task${touchedTasks.length === 1 ? "" : "s"} today:`,
    );
    for (const task of touchedTasks) {
      lines.push(`- ${task.title} (${task.status})`);
    }
  }

  if (logs.length > 0) {
    lines.push(
      `Logged ${hours}h across ${logs.length} entr${logs.length === 1 ? "y" : "ies"}.`,
    );
    const notes = logs
      .map((log) => log.note.trim())
      .filter((note) => note.length > 0);
    for (const note of notes) {
      lines.push(`- ${note}`);
    }
  }

  await prisma.standupUpdate.create({
    data: {
      id: crypto.randomUUID(),
      tenantId,
      userId,
      taskId: touchedTasks[0]?.id ?? logs[0]?.taskId ?? null,
      text: lines.join("\n"),
      hours,
      source: "auto",
    },
  });
}

standupUpdatesRouter.use(tenantAuthMiddleware);
// Internal standup reporting has no client-facing equivalent.
standupUpdatesRouter.use(denyClientAccess);

standupUpdatesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    const role = await prisma.tenantRole.findFirst({
      where: { id: req.roleId! },
      select: { name: true },
    });
    const roleName = role?.name ?? "";

    let where: Record<string, unknown> = { tenantId, userId };
    if (STUDIO_LEADERSHIP_ROLES.includes(roleName)) {
      where = { tenantId };
    } else if (DEPARTMENT_LEADERSHIP_ROLES.includes(roleName)) {
      where = {
        tenantId,
        OR: [
          { userId },
          ...(req.departmentId
            ? [{ user: { departmentId: req.departmentId } }]
            : []),
        ],
      };
    }

    const rows = await prisma.standupUpdate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch standup updates");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// A standup update is always authored by the caller -- there is no
// "post on behalf of" case, so userId comes from the session, never the body.
standupUpdatesRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { text, taskId, hours } = req.body;
    if (typeof text !== "string" || !text.trim())
      return res.status(400).json({ error: "text is required" });

    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { tenantId, id: taskId },
        select: { id: true },
      });
      if (!task) return res.status(400).json({ error: "Invalid taskId" });
    }

    const created = await prisma.standupUpdate.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        userId,
        taskId: taskId || null,
        text: text.trim(),
        hours: typeof hours === "number" && hours > 0 ? Math.round(hours) : 0,
        source: "manual",
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    req.log.error(err, "Failed to post standup update");
    return res.status(500).json({ error: "Internal server error" });
  }
});
