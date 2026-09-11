import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess } from "../middleware/rbac";
import { getVisibilityScope, dailyLogScopeWhere } from "../lib/visibilityScope";
import * as crypto from "crypto";

export const dailyLogsRouter = Router();

dailyLogsRouter.use(tenantAuthMiddleware);
// Internal employee time-tracking has no client-facing equivalent.
dailyLogsRouter.use(denyClientAccess);

dailyLogsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { taskId, userId } = req.query;
    // Timesheet entries are personal data: an artist reads only their own,
    // a lead their department's. Intersected with (not overwritten by) the
    // caller's own ?userId= filter, so narrowing a query can never widen
    // what comes back.
    const scopeWhere = await dailyLogScopeWhere(tenantId, await getVisibilityScope(req));
    const rows = await prisma.dailyLog.findMany({
      where: {
        tenantId,
        ...(typeof taskId === "string" ? { taskId } : {}),
        AND: [
          ...(typeof userId === "string" ? [{ userId }] : []),
          scopeWhere,
        ],
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

dailyLogsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { taskId, date, hours, note } = req.body;
    if (!taskId || !date || typeof hours !== "number")
      return res.status(400).json({ error: "Missing taskId, date, or hours" });

    const task = await prisma.task.findFirst({ where: { tenantId, id: taskId } });
    if (!task) return res.status(400).json({ error: "Invalid taskId" });

    const created = await prisma.dailyLog.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        taskId,
        userId,
        date,
        hours,
        note: note || "",
      },
    });

    // Roll the logged hours into the task's actualHours total.
    await prisma.task.updateMany({
      where: { tenantId, id: taskId },
      data: { actualHours: task.actualHours + hours },
    });

    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PATCHABLE_FIELDS = ["date", "hours", "note"] as const;

// A log entry is owned by whoever logged it -- these are that person's own
// reported hours, so only they can correct or remove them (matches POST's
// own req.userId-only creation, and there's no "edit someone else's
// timesheet" capability defined anywhere in this app).
dailyLogsRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: combining tenantAuthMiddleware (applied via router.use()
    // above, typed against the generic Express Request) with this route's
    // "/:id" path typing makes TS widen req.params.id to `string | string[]`
    // for overload resolution purposes, even though a plain ":id" segment
    // is always a single string at runtime (same issue documented in
    // routes/users.ts's PATCH /:id).
    const logId = req.params.id as string;

    const existing = await prisma.dailyLog.findFirst({ where: { tenantId, id: logId } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.userId !== req.userId)
      return res.status(403).json({ error: "Forbidden: not your log entry" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }

    // Re-roll the task's actualHours total by the delta rather than the
    // absolute new value -- other log entries against the same task
    // contribute to that same total.
    if (typeof updates.hours === "number" && updates.hours !== existing.hours) {
      const delta = updates.hours - existing.hours;
      const task = await prisma.task.findFirst({ where: { tenantId, id: existing.taskId } });
      if (task) {
        await prisma.task.updateMany({
          where: { tenantId, id: existing.taskId },
          data: { actualHours: task.actualHours + delta },
        });
      }
    }

    await prisma.dailyLog.updateMany({ where: { tenantId, id: logId }, data: updates });
    const updated = await prisma.dailyLog.findFirstOrThrow({ where: { tenantId, id: logId } });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

dailyLogsRouter.delete("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const logId = req.params.id as string;

    const existing = await prisma.dailyLog.findFirst({ where: { tenantId, id: logId } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.userId !== req.userId)
      return res.status(403).json({ error: "Forbidden: not your log entry" });

    // Reverse this entry's contribution to the task's actualHours total
    // before removing it, so deleting a mislogged entry doesn't leave the
    // task's reported hours permanently inflated.
    const task = await prisma.task.findFirst({ where: { tenantId, id: existing.taskId } });
    if (task) {
      await prisma.task.updateMany({
        where: { tenantId, id: existing.taskId },
        data: { actualHours: Math.max(0, task.actualHours - existing.hours) },
      });
    }

    await prisma.dailyLog.deleteMany({ where: { tenantId, id: logId } });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
