import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

// See the identical comment in routes/episodes.ts — the FK constraint alone
// only checks the row exists, not who owns it, so each foreign key coming
// from the request body needs an explicit tenant-ownership check before a
// sequence is allowed to link to it.
async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function episodeInTenant(id: string, tenantId: string) {
  const row = await prisma.episode.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function sequenceInTenant(id: string, tenantId: string) {
  const row = await prisma.sequence.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

export const sequencesRouter = Router();

sequencesRouter.use(tenantAuthMiddleware);
// Internal pipeline sequence management has no client-facing equivalent.
sequencesRouter.use(denyClientAccess);

sequencesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, episodeId } = req.query;
    const rows = await prisma.sequence.findMany({
      where: {
        tenantId,
        ...(typeof projectId === "string" ? { projectId } : {}),
        ...(typeof episodeId === "string" ? { episodeId } : {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// create_tasks matches TracksheetImportDialog.tsx's own gate -- sequences
// are created as part of the same tracksheet-import flow episodes/shots
// are. The self-service .../team routes below are deliberately left
// ungated (any authenticated user joins/leaves on their own).
sequencesRouter.post("/", requireCapability("create_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, episodeId, name } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });
    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(400).json({ error: "Invalid projectId" });
    if (episodeId && !(await episodeInTenant(episodeId, tenantId)))
      return res.status(400).json({ error: "Invalid episodeId" });

    const created = await prisma.sequence.create({
      data: { id: crypto.randomUUID(), tenantId, projectId, episodeId: episodeId || null, name },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

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

    const rows = await prisma.sequenceTeamMember.findMany({
      where: { tenantId, sequenceId },
      select: {
        id: true,
        userId: true,
        joinedAt: true,
        user: { select: { name: true, avatar: true, departmentId: true } },
      },
    });
    const members = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      joinedAt: r.joinedAt,
      name: r.user.name,
      avatar: r.user.avatar,
      departmentId: r.user.departmentId,
    }));
    return res.json(members);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Join is idempotent (upsert with a no-op update against the sequence+user
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

    const member = await prisma.sequenceTeamMember.upsert({
      where: { sequenceId_userId: { sequenceId, userId } },
      update: {},
      create: { id: crypto.randomUUID(), tenantId, sequenceId, userId },
    });
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

    await prisma.sequenceTeamMember.deleteMany({
      where: { tenantId, sequenceId, userId },
    });
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
