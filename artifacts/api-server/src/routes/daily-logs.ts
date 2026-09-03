import { Router } from "express";
import { db } from "@workspace/db";
import { dailyLogsTable, tasksTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const dailyLogsRouter = Router();

dailyLogsRouter.use(tenantAuthMiddleware);

dailyLogsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { taskId, userId } = req.query;
    const conditions = [eq(dailyLogsTable.tenantId, tenantId)];
    if (typeof taskId === "string") conditions.push(eq(dailyLogsTable.taskId, taskId));
    if (typeof userId === "string") conditions.push(eq(dailyLogsTable.userId, userId));
    const rows = await db
      .select()
      .from(dailyLogsTable)
      .where(and(...conditions));
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

    const [task] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));
    if (!task) return res.status(400).json({ error: "Invalid taskId" });

    const newId = crypto.randomUUID();
    await db.insert(dailyLogsTable).values({
      id: newId,
      tenantId,
      taskId,
      userId,
      date,
      hours,
      note: note || "",
    });

    // Roll the logged hours into the task's actualHours total.
    await db
      .update(tasksTable)
      .set({ actualHours: task.actualHours + hours })
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));

    const [created] = await db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.tenantId, tenantId), eq(dailyLogsTable.id, newId)));
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

    const [existing] = await db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.tenantId, tenantId), eq(dailyLogsTable.id, logId)));
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
      const [task] = await db
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, existing.taskId)));
      if (task) {
        await db
          .update(tasksTable)
          .set({ actualHours: task.actualHours + delta })
          .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, existing.taskId)));
      }
    }

    await db
      .update(dailyLogsTable)
      .set(updates)
      .where(and(eq(dailyLogsTable.tenantId, tenantId), eq(dailyLogsTable.id, logId)));

    const [updated] = await db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.tenantId, tenantId), eq(dailyLogsTable.id, logId)));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

dailyLogsRouter.delete("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const logId = req.params.id as string;

    const [existing] = await db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.tenantId, tenantId), eq(dailyLogsTable.id, logId)));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.userId !== req.userId)
      return res.status(403).json({ error: "Forbidden: not your log entry" });

    // Reverse this entry's contribution to the task's actualHours total
    // before removing it, so deleting a mislogged entry doesn't leave the
    // task's reported hours permanently inflated.
    const [task] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, existing.taskId)));
    if (task) {
      await db
        .update(tasksTable)
        .set({ actualHours: Math.max(0, task.actualHours - existing.hours) })
        .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, existing.taskId)));
    }

    await db
      .delete(dailyLogsTable)
      .where(and(eq(dailyLogsTable.tenantId, tenantId), eq(dailyLogsTable.id, logId)));
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
