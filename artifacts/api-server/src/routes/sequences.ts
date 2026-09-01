import { Router } from "express";
import { db } from "@workspace/db";
import { sequencesTable, projectsTable, episodesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

// See the identical comment in routes/episodes.ts — the FK constraint alone
// only checks the row exists, not who owns it, so each foreign key coming
// from the request body needs an explicit tenant-ownership check before a
// sequence is allowed to link to it.
async function projectInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.tenantId, tenantId)));
  return !!row;
}
async function episodeInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: episodesTable.id })
    .from(episodesTable)
    .where(and(eq(episodesTable.id, id), eq(episodesTable.tenantId, tenantId)));
  return !!row;
}

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

    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(400).json({ error: "Invalid projectId" });
    if (episodeId && !(await episodeInTenant(episodeId, tenantId)))
      return res.status(400).json({ error: "Invalid episodeId" });

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
