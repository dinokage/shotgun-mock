import { Router } from "express";
import { db } from "@workspace/db";
import { episodesTable, projectsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

// Confirms projectId actually belongs to the caller's tenant before it's
// allowed to be linked onto an episode — the FK constraint alone only
// checks the row exists, not who owns it, so without this check any
// authenticated user could cross-link an episode to another tenant's
// project.
async function projectInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.tenantId, tenantId)));
  return !!row;
}

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

// create_tasks matches TracksheetImportDialog.tsx's own gate -- episodes
// are created as part of the same tracksheet-import flow shots/sequences
// are, which leads (no manage_pipeline) legitimately use.
episodesRouter.post("/", requireCapability("create_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(400).json({ error: "Invalid projectId" });

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
