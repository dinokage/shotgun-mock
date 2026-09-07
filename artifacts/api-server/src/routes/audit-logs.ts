import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess } from "../middleware/rbac";

export const auditLogsRouter = Router();

auditLogsRouter.use(tenantAuthMiddleware);
// The audit trail is strictly internal.
auditLogsRouter.use(denyClientAccess);

// The Time Travel / audit-history UI is leadership-gated client-side only
// (App.tsx's LeadershipGuard, which checks store/permissions.ts's
// LEADERSHIP_ROLES -- a coarse role check, not one specific capability), so
// this route had no server-side gate at all: any authenticated tenant
// member, including an artist, could read the full studio audit history via
// a direct API call. Mirror LeadershipGuard's exact rule server-side, the
// same way routes/tasks.ts looks up a caller's real role name (never
// trusted from the client) via req.roleId for its own server-enforced rules.
const LEADERSHIP_ROLE_NAMES = new Set([
  "admin",
  "production_head",
  "producer",
  "lead",
]);

async function callerIsLeadership(roleId: string, tenantId: string) {
  const row = await prisma.tenantRole.findFirst({
    where: { id: roleId, tenantId },
    select: { name: true },
  });
  return !!row?.name && LEADERSHIP_ROLE_NAMES.has(row.name);
}

auditLogsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    if (
      !req.roleId ||
      !(await callerIsLeadership(req.roleId, tenantId))
    ) {
      return res
        .status(403)
        .json({ error: "Forbidden: Leadership access required" });
    }
    const { entityId } = req.query;
    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(typeof entityId === "string" ? { targetEntityId: entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      // This table has no pagination and grows unbounded -- cap the result
      // set instead of ever returning the entire tenant history in one shot.
      take: 200,
    });
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch audit logs");
    return res.status(500).json({ error: "Internal server error" });
  }
});
