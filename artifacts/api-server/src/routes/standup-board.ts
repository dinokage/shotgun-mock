import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess, requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

// A taskId off the request body only proves the row exists (FK), not that it
// belongs to the caller's tenant -- without this check any authenticated user
// could queue another tenant's task into their dailies playlist.
async function taskInTenant(id: string, tenantId: string) {
  const row = await prisma.task.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  return !!row;
}

// One shared queue per tenant, not per user: the point of dailies is that
// everyone in the room watches the same list in the same order, so there is
// deliberately no per-user filter here (matches @@unique([tenantId, taskId])).
export const standupPlaylistRouter = Router();

standupPlaylistRouter.use(tenantAuthMiddleware);
standupPlaylistRouter.use(denyClientAccess);

// Reading the queue is open to anyone internal -- artists need to see what
// is being screened. Changing it is a production-coordination action, which
// is what the Dailies tab's own leadership gate implies; without this the API
// was open to every employee while the UI pretended otherwise.
const canRunDailies = requireCapability("assign_tasks");

standupPlaylistRouter.get("/", async (req, res) => {
  try {
    const rows = await prisma.standupPlaylistItem.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch standup playlist");
    return res.status(500).json({ error: "Internal server error" });
  }
});

standupPlaylistRouter.post("/", canRunDailies, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { taskId } = req.body;
    if (typeof taskId !== "string" || !taskId)
      return res.status(400).json({ error: "taskId is required" });
    if (!(await taskInTenant(taskId, tenantId)))
      return res.status(400).json({ error: "Invalid taskId" });

    const existing = await prisma.standupPlaylistItem.findFirst({
      where: { tenantId, taskId },
    });
    if (existing) return res.json(existing);

    const last = await prisma.standupPlaylistItem.findFirst({
      where: { tenantId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const created = await prisma.standupPlaylistItem.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        taskId,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        addedById: req.userId ?? null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    req.log.error(err, "Failed to add to standup playlist");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Reorder after a drag: the full ordering is sent, so entries the caller
// didn't name are left alone rather than silently dropped.
standupPlaylistRouter.put("/order", canRunDailies, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds) || taskIds.some((id) => typeof id !== "string"))
      return res.status(400).json({ error: "taskIds must be an array of ids" });

    const rows = await prisma.standupPlaylistItem.findMany({
      where: { tenantId, taskId: { in: taskIds as string[] } },
      select: { id: true, taskId: true },
    });
    const idByTaskId = new Map(rows.map((row) => [row.taskId, row.id]));

    await prisma.$transaction(
      (taskIds as string[])
        .map((taskId, index) => ({ id: idByTaskId.get(taskId), index }))
        .filter((entry): entry is { id: string; index: number } => !!entry.id)
        .map(({ id, index }) =>
          prisma.standupPlaylistItem.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
    );

    const updated = await prisma.standupPlaylistItem.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to reorder standup playlist");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Ends a dailies session by emptying the shared queue.
standupPlaylistRouter.delete("/", canRunDailies, async (req, res) => {
  try {
    await prisma.standupPlaylistItem.deleteMany({
      where: { tenantId: req.tenantId! },
    });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to clear standup playlist");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Keyed by taskId, not the row id: the playlist is unique per task within a
// tenant and every caller already holds the task id.
standupPlaylistRouter.delete("/:taskId", canRunDailies, async (req, res) => {
  try {
    await prisma.standupPlaylistItem.deleteMany({
      where: { tenantId: req.tenantId!, taskId: String(req.params.taskId) },
    });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to remove from standup playlist");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export const standupApprovalsRouter = Router();

standupApprovalsRouter.use(tenantAuthMiddleware);
standupApprovalsRouter.use(denyClientAccess);

standupApprovalsRouter.get("/", async (req, res) => {
  try {
    const rows = await prisma.standupApproval.findMany({
      where: { tenantId: req.tenantId! },
      select: { feedItemId: true, userId: true },
      take: 1000,
    });
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch standup approvals");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// An approval is always the caller's own, so userId comes from the session
// and never the body -- otherwise anyone could approve as anyone else.
// feedItemId is intentionally unvalidated against any table: the feed mixes
// sources, which is why the column is a plain string and not an FK.
standupApprovalsRouter.post("/toggle", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { feedItemId } = req.body;
    if (typeof feedItemId !== "string" || !feedItemId)
      return res.status(400).json({ error: "feedItemId is required" });

    const existing = await prisma.standupApproval.findFirst({
      where: { tenantId, feedItemId, userId },
      select: { id: true },
    });

    if (existing) {
      await prisma.standupApproval.delete({ where: { id: existing.id } });
      return res.json({ feedItemId, approved: false });
    }

    await prisma.standupApproval.create({
      data: { id: crypto.randomUUID(), tenantId, feedItemId, userId },
    });
    return res.status(201).json({ feedItemId, approved: true });
  } catch (err) {
    req.log.error(err, "Failed to toggle standup approval");
    return res.status(500).json({ error: "Internal server error" });
  }
});
