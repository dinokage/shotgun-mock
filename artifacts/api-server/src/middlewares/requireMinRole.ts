import type { NextFunction, Request, Response } from "express";
import { ROLE_RANK } from "@workspace/db";
import type { Role } from "@workspace/db";

export function requireMinRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }

    next();
  };
}
