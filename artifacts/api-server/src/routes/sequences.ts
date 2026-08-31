import { Router } from "express";
import { db } from "@workspace/db";
import { sequencesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const sequencesRouter = Router();

sequencesRouter.use(tenantAuthMiddleware);

sequencesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, episodeId } = req.query;
    const conditions = [eq(sequencesTable.tenantId, tenantId)];
    if (typeof projectId === "string") {
      conditions.push(eq(sequencesTable.projectId, projectId));
    }
    if (typeof episodeId === "string") {
      conditions.push(eq(sequencesTable.episodeId, episodeId));
    }
    const rows = await db
      .select()
      .from(sequencesTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

sequencesRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, episodeId, name } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    const newId = crypto.randomUUID();
    await db
      .insert(sequencesTable)
      .values({ id: newId, tenantId, projectId, episodeId: episodeId || null, name });

    const [created] = await db
      .select()
      .from(sequencesTable)
      .where(and(eq(sequencesTable.tenantId, tenantId), eq(sequencesTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
