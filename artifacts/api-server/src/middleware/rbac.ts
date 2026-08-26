import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { tenantRoleCapabilitiesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export function requireCapability(capabilityId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.roleId) {
      res.status(403).json({ error: "Forbidden: Missing role" });
      return;
    }

    const [grant] = await db
      .select()
      .from(tenantRoleCapabilitiesTable)
      .where(
        and(
          eq(tenantRoleCapabilitiesTable.roleId, req.roleId),
          eq(tenantRoleCapabilitiesTable.capabilityId, capabilityId),
        ),
      );

    if (!grant) {
      res.status(403).json({ error: "Forbidden: Missing capability" });
      return;
    }

    next();
  };
}
