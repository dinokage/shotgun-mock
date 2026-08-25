import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const projectsRouter = Router();

projectsRouter.use(tenantAuthMiddleware);

projectsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.tenantId, tenantId));
    return res.json(projects);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

projectsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name } = req.body;
    
    if (!name) return res.status(400).json({ error: "Missing name" });

    const newId = crypto.randomUUID();
    await db.insert(projectsTable).values({
      id: newId,
      tenantId,
      name,
      status: "active",
    });

    const [created] = await db.select().from(projectsTable).where(and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
