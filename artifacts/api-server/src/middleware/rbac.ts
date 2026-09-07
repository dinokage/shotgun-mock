import { Request, Response, NextFunction } from "express";
import { prisma } from "@workspace/db";

// A client-access session (redeemed via client-access.ts's /redeem, carrying
// req.clientAccessLinkId, no req.userId) is not an employee -- it must never
// reach an internal-only resource, regardless of what capability its "client"
// role happens to hold. Apply this as router.use(denyClientAccess) on every
// router with no legitimate client use case (tasks, assets, daily-logs,
// notifications, sequences, audit-logs, departments), and per-route on
// client-access.ts's own link-management endpoints (create/list/revoke),
// which a client session would otherwise pass via requireCapability("approve_reviews")
// -- the same capability their role holds for an unrelated purpose -- and use
// to mint itself a fresh, differently-scoped access link.
export function denyClientAccess(req: Request, res: Response, next: NextFunction) {
  if (req.clientAccessLinkId) {
    res.status(403).json({ error: "Forbidden: not available to client-access sessions" });
    return;
  }
  next();
}

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
