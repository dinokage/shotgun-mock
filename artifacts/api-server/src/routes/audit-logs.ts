import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable, tenantRolesTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";

export const auditLogsRouter = Router();

auditLogsRouter.use(tenantAuthMiddleware);

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
  const [row] = await db
    .select({ name: tenantRolesTable.name })
    .from(tenantRolesTable)
    .where(
      and(
        eq(tenantRolesTable.id, roleId),
        eq(tenantRolesTable.tenantId, tenantId),
      ),
    );
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
    const conditions = [eq(auditLogsTable.tenantId, tenantId)];
    if (typeof entityId === "string")
      conditions.push(eq(auditLogsTable.targetEntityId, entityId));
    const rows = await db
      .select()
      .from(auditLogsTable)
      .where(and(...conditions))
      .orderBy(desc(auditLogsTable.createdAt))
      // This table has no pagination and grows unbounded -- cap the result
      // set instead of ever returning the entire tenant history in one shot.
      .limit(200);
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch audit logs");
    return res.status(500).json({ error: "Internal server error" });
  }
});
