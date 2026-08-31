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
