import { Router } from "express";
import { db } from "@workspace/db";
import {
  assetsTable,
  projectsTable,
  episodesTable,
  sequencesTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { recordAuditLog } from "../lib/auditLog";
import * as crypto from "crypto";

// Each check confirms a foreign-key id actually belongs to the caller's
// tenant before it's allowed to be linked onto an asset. A DB foreign key
// only verifies the referenced row exists, not who owns it — without this
// check, any authenticated user could cross-link their tenant's data to
// another tenant's project/episode/sequence/user by guessing or
// discovering an id (IDOR). Same pattern as routes/shots.ts.
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

export const assetsRouter = Router();

assetsRouter.use(tenantAuthMiddleware);

assetsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    const conditions = [eq(assetsTable.tenantId, tenantId)];
    if (typeof projectId === "string") {
      conditions.push(eq(assetsTable.projectId, projectId));
    }
    const rows = await db
      .select()
      .from(assetsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

assetsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name, type, episodeId, sequenceId, assigneeId } = req.body;
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
    await db.insert(assetsTable).values({
      id: newId,
      tenantId,
      projectId,
      name,
      type: type || "Prop",
      episodeId: episodeId || null,
      sequenceId: sequenceId || null,
      assigneeId: assigneeId || null,
    });

    const [created] = await db
      .select()
      .from(assetsTable)
      .where(and(eq(assetsTable.tenantId, tenantId), eq(assetsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PATCHABLE_FIELDS = [
  "name",
  "type",
  "status",
  "assigneeId",
  "version",
  "usdVersion",
  "tags",
  "thumbnail",
  "fileSize",
  "polyCount",
  "dependencies",
  "publishStatus",
  "description",
  "notes",
] as const;

assetsRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const assetId = req.params.id;

    const [existing] = await db
      .select()
      .from(assetsTable)
      .where(and(eq(assetsTable.tenantId, tenantId), eq(assetsTable.id, assetId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (
      "assigneeId" in req.body &&
      req.body.assigneeId &&
      !(await userInTenant(req.body.assigneeId, tenantId))
    )
      return res.status(400).json({ error: "Invalid assigneeId" });

    const updates: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) {
        updates[field] = req.body[field];
        before[field] = (existing as Record<string, unknown>)[field];
      }
    }
    updates.updatedAt = new Date();

    await db
      .update(assetsTable)
      .set(updates)
      .where(and(eq(assetsTable.tenantId, tenantId), eq(assetsTable.id, assetId)));

    const [updated] = await db
      .select()
      .from(assetsTable)
      .where(and(eq(assetsTable.tenantId, tenantId), eq(assetsTable.id, assetId)));

    recordAuditLog({
      tenantId,
      actorUserId: req.userId!,
      action: "update",
      targetEntityType: "asset",
      targetEntityId: assetId,
      before,
      after: updates,
    }).catch((err) => req.log.error(err, "audit log write failed"));

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
