import { Router } from "express";
import { prisma } from "@workspace/db";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";

export const notificationsRouter = Router();

notificationsRouter.use(tenantAuthMiddleware);

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

// Mirrors lib/taskShape.ts's getProductionManagerApprovers on the frontend:
// a department's own production_head, falling back to the Production
// Management department's production_head(s), falling back to any
// production_head in the tenant. Kept as a separate server-side copy (not
// shared code) since the two run in different packages/runtimes.
export async function findProductionManagers(
  tenantId: string,
  departmentName: string | null | undefined,
): Promise<{ id: string }[]> {
  const productionHeads = await prisma.user.findMany({
    where: { tenantId, role: { name: "production_head" } },
    select: { id: true, departmentId: true },
  });
  if (productionHeads.length === 0) return [];

  const depts = await prisma.department.findMany({ where: { tenantId } });

  const dept = depts.find((d) => d.name === departmentName);
  const ownDeptPMs = dept
    ? productionHeads.filter((u) => u.departmentId === dept.id)
    : [];
  if (ownDeptPMs.length > 0) return ownDeptPMs;

  const mainDept = depts.find((d) => d.name === "Production Management");
  const mainPMs = mainDept
    ? productionHeads.filter((u) => u.departmentId === mainDept.id)
    : [];
  if (mainPMs.length > 0) return mainPMs;

  return productionHeads;
}
