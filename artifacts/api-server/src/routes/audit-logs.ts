import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";

export const auditLogsRouter = Router();

auditLogsRouter.use(tenantAuthMiddleware);

auditLogsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId } = req.query;
    const conditions = [eq(auditLogsTable.tenantId, tenantId)];
    if (typeof entityId === "string")
      conditions.push(eq(auditLogsTable.targetEntityId, entityId));
    const rows = await db
      .select()
      .from(auditLogsTable)
      .where(and(...conditions))
      .orderBy(desc(auditLogsTable.createdAt));
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch audit logs");
    return res.status(500).json({ error: "Internal server error" });
  }
});
