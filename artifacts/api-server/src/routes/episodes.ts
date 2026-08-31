import { Router } from "express";
import { db } from "@workspace/db";
import { episodesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const episodesRouter = Router();

episodesRouter.use(tenantAuthMiddleware);

episodesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    const conditions = [eq(episodesTable.tenantId, tenantId)];
    if (typeof projectId === "string") {
      conditions.push(eq(episodesTable.projectId, projectId));
    }
    const rows = await db
      .select()
      .from(episodesTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

episodesRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    const newId = crypto.randomUUID();
    await db.insert(episodesTable).values({ id: newId, tenantId, projectId, name });

    const [created] = await db
      .select()
      .from(episodesTable)
      .where(and(eq(episodesTable.tenantId, tenantId), eq(episodesTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
