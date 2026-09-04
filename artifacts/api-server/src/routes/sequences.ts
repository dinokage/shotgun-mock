import { Router } from "express";
import { db } from "@workspace/db";
import {
  sequencesTable,
  projectsTable,
  episodesTable,
  sequenceTeamMembersTable,
  usersTable,
} from "@workspace/db/schema";
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

async function sequenceInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: sequencesTable.id })
    .from(sequencesTable)
    .where(and(eq(sequencesTable.id, id), eq(sequencesTable.tenantId, tenantId)));
  return !!row;
}

// Self-service "who's working this sequence" roster -- an artist joins or
// leaves on their own, no lead/PM assignment step. Membership is what the
// early-completion auto-reassignment flow (routes/tasks.ts) reads to find
// who's free and which department (via usersTable, joined below) they
// belong to.
sequencesRouter.get("/:id/team", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const sequenceId = req.params.id;
    if (!(await sequenceInTenant(sequenceId, tenantId)))
      return res.status(404).json({ error: "Not found" });

    const members = await db
      .select({
        id: sequenceTeamMembersTable.id,
        userId: sequenceTeamMembersTable.userId,
        joinedAt: sequenceTeamMembersTable.joinedAt,
        name: usersTable.name,
        avatar: usersTable.avatar,
        departmentId: usersTable.departmentId,
      })
      .from(sequenceTeamMembersTable)
      .innerJoin(usersTable, eq(sequenceTeamMembersTable.userId, usersTable.id))
      .where(
        and(
          eq(sequenceTeamMembersTable.tenantId, tenantId),
          eq(sequenceTeamMembersTable.sequenceId, sequenceId),
        ),
      );
    return res.json(members);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Join is idempotent (ON CONFLICT DO NOTHING against the sequence+user
// unique constraint) -- clicking "Join Team" twice, or a double-submit,
// should never 500 or produce a duplicate row.
sequencesRouter.post("/:id/team", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const sequenceId = req.params.id;
    if (!(await sequenceInTenant(sequenceId, tenantId)))
      return res.status(404).json({ error: "Not found" });

    await db
      .insert(sequenceTeamMembersTable)
      .values({ id: crypto.randomUUID(), tenantId, sequenceId, userId })
      .onConflictDoNothing();

    const [member] = await db
      .select()
      .from(sequenceTeamMembersTable)
      .where(
        and(
          eq(sequenceTeamMembersTable.tenantId, tenantId),
          eq(sequenceTeamMembersTable.sequenceId, sequenceId),
          eq(sequenceTeamMembersTable.userId, userId),
        ),
      );
    return res.status(201).json(member);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Self-leave only -- this is a self-service roster, not something a lead
// manages on someone else's behalf (a lead removing an artist would be a
// different, capability-gated action; not built here).
sequencesRouter.delete("/:id/team/me", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const sequenceId = req.params.id;

    await db
      .delete(sequenceTeamMembersTable)
      .where(
        and(
          eq(sequenceTeamMembersTable.tenantId, tenantId),
          eq(sequenceTeamMembersTable.sequenceId, sequenceId),
          eq(sequenceTeamMembersTable.userId, userId),
        ),
      );
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
