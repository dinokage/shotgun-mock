import { Router } from "express";
import { db } from "@workspace/db";
import {
  shotsTable,
  projectsTable,
  episodesTable,
  sequencesTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

// Each check confirms a foreign-key id actually belongs to the caller's
// tenant before it's allowed to be linked onto a shot. Without this, any
// authenticated user could pass another tenant's projectId/episodeId/
// sequenceId/assigneeId and it would satisfy the FK constraint (which only
// checks the row exists, not who owns it), silently cross-linking tenants'
// data — the FK constraint alone is not a tenant-isolation boundary.
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
async function sequenceInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: sequencesTable.id })
    .from(sequencesTable)
    .where(and(eq(sequencesTable.id, id), eq(sequencesTable.tenantId, tenantId)));
  return !!row;
}
async function userInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
  return !!row;
}

export const shotsRouter = Router();

shotsRouter.use(tenantAuthMiddleware);

shotsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    const conditions = [eq(shotsTable.tenantId, tenantId)];
    if (typeof projectId === "string") {
      conditions.push(eq(shotsTable.projectId, projectId));
    }
    const rows = await db
      .select()
      .from(shotsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

shotsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name, episodeId, sequenceId, assigneeId } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(400).json({ error: "Invalid projectId" });
    if (episodeId && !(await episodeInTenant(episodeId, tenantId)))
      return res.status(400).json({ error: "Invalid episodeId" });
    if (sequenceId && !(await sequenceInTenant(sequenceId, tenantId)))
      return res.status(400).json({ error: "Invalid sequenceId" });
    if (assigneeId && !(await userInTenant(assigneeId, tenantId)))
      return res.status(400).json({ error: "Invalid assigneeId" });

    const newId = crypto.randomUUID();
    await db.insert(shotsTable).values({
      id: newId,
      tenantId,
      projectId,
      name,
      episodeId: episodeId || null,
      sequenceId: sequenceId || null,
      assigneeId: assigneeId || null,
    });

    const [created] = await db
      .select()
      .from(shotsTable)
      .where(and(eq(shotsTable.tenantId, tenantId), eq(shotsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Whitelisted patchable fields — every column a shot's UI can legitimately
// update in place (status, review states, assignment, notes, version
// pointers). Deliberately excludes id/tenantId/projectId/createdAt.
const PATCHABLE_FIELDS = [
  "name",
  "status",
  "assigneeId",
  "frameRange",
  "duration",
  "complexity",
  "currentVersion",
  "usdVersion",
  "internalReviewStatus",
  "clientReviewStatus",
  "thumbnail",
  "notes",
] as const;

shotsRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const shotId = req.params.id;

    const [existing] = await db
      .select()
      .from(shotsTable)
      .where(and(eq(shotsTable.tenantId, tenantId), eq(shotsTable.id, shotId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (
      "assigneeId" in req.body &&
      req.body.assigneeId &&
      !(await userInTenant(req.body.assigneeId, tenantId))
    )
      return res.status(400).json({ error: "Invalid assigneeId" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    updates.updatedAt = new Date();

    await db
      .update(shotsTable)
      .set(updates)
      .where(and(eq(shotsTable.tenantId, tenantId), eq(shotsTable.id, shotId)));

    const [updated] = await db
      .select()
      .from(shotsTable)
      .where(and(eq(shotsTable.tenantId, tenantId), eq(shotsTable.id, shotId)));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
