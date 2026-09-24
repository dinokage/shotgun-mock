import { Router } from "express";
import { prisma } from "@workspace/db";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess } from "../middleware/rbac";

export const notificationsRouter = Router();

notificationsRouter.use(tenantAuthMiddleware);
// Internal employee notification feed has no client-facing equivalent.
notificationsRouter.use(denyClientAccess);

// Polled every ~10s by the frontend (see hooks/useNotifications.ts) rather
// than pushed -- simplest real cross-user delivery mechanism available
// without standing up websockets, and "updated within seconds" only needs
// a short poll interval, not a persistent connection.
notificationsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await prisma.notification.findMany({
      where: { tenantId, recipientUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch notifications");
    return res.status(500).json({ error: "Internal server error" });
  }
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id as string;

    const result = await prisma.notification.updateMany({
      where: {
        id,
        tenantId,
        // Never let one user mark another's notification read.
        recipientUserId: userId,
      },
      data: { read: true },
    });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });
    const updated = await prisma.notification.findFirstOrThrow({
      where: { id, tenantId, recipientUserId: userId },
    });
    return res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to mark notification read");
    return res.status(500).json({ error: "Internal server error" });
  }
});

notificationsRouter.post("/read-all", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await prisma.notification.updateMany({
      where: { tenantId, recipientUserId: userId },
      data: { read: true },
    });
    return res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Failed to mark all notifications read");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- Server-side notification creation, called from other routes --------
//
// Not exposed as its own POST endpoint: a notification is always a side
// effect of some other real event (login, task claim, review submission,
// client activity), authored by server-side route code that already knows
// who the recipient should be -- never something a client directly asks to
// create on someone else's behalf.

export async function createNotification(params: {
  tenantId: string;
  recipientUserId: string;
  category: string;
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
}) {
  await prisma.notification.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: params.tenantId,
      recipientUserId: params.recipientUserId,
      category: params.category,
      title: params.title,
      description: params.description,
      entityType: params.entityType,
      entityId: params.entityId,
      actionUrl: params.actionUrl,
    },
  });
}

// Mirrors lib/taskShape.ts's getProductionManagerApprovers on the frontend.
// Migration 0023 removed the separate, department-scoped production_head
// role -- admin is now the studio's sole top role and is studio-wide by
// nature (not department-assigned), so every admin is notified rather than
// resolving a department-specific subset. Kept as a separate server-side
// copy (not shared code) since the two run in different packages/runtimes.
export async function findProductionManagers(
  tenantId: string,
  _departmentName: string | null | undefined,
): Promise<{ id: string }[]> {
  return prisma.user.findMany({
    where: { tenantId, role: { name: "admin" } },
    select: { id: true },
  });
}
