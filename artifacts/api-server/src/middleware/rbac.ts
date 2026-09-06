import { Request, Response, NextFunction } from "express";
import { prisma } from "@workspace/db";

export function requireCapability(capabilityId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.roleId) {
      res.status(403).json({ error: "Forbidden: Missing role" });
      return;
    }

    const grant = await prisma.tenantRoleCapability.findFirst({
      where: { roleId: req.roleId, capabilityId },
    });

    if (!grant) {
      res.status(403).json({ error: "Forbidden: Missing capability" });
      return;
    }

    next();
  };
}
