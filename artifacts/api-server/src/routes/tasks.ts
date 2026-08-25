import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const tasksRouter = Router();

tasksRouter.use(tenantAuthMiddleware);

tasksRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Note: In real logic, projectId filtering would join with entity (asset/shot).
    const tasksList = await db.select().from(tasksTable).where(eq(tasksTable.tenantId, tenantId));
    return res.json(tasksList);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType, status } = req.body;
    
    if (!entityId || !entityType) return res.status(400).json({ error: "Missing entityId or entityType" });

    const newId = crypto.randomUUID();
    await db.insert(tasksTable).values({
      id: newId,
      tenantId,
      entityId,
      entityType,
      status: status || "ready",
    });

    const [created] = await db.select().from(tasksTable).where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const taskId = req.params.id;
    const { status } = req.body;
    
    const [existing] = await db.select().from(tasksTable).where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));
    
    if (!existing) return res.status(404).json({ error: "Not found" });

    await db.update(tasksTable).set({ status }).where(eq(tasksTable.id, taskId));

    const [updated] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
