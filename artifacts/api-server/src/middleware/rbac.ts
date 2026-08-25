import { Request, Response, NextFunction } from "express";

export function requireCapability(capabilityId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // In a real app we would query tenantRoleCapabilitiesTable to verify
    // the user's roleId has this capabilityId.
    // For this prototype, if you have a roleId, we pass you through.
    if (!req.roleId) {
      res.status(403).json({ error: "Forbidden: Missing role" });
      return;
    }
    next();
  };
}
