import type { NextFunction, Request, Response } from "express";
import type { Role } from "@workspace/db";
import { verifySessionToken } from "../lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "../lib/auth/cookies";

declare module "express-serve-static-core" {
  interface Request {
    user?: { id: string; studioId: string; role: Role };
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  const payload = typeof token === "string" ? verifySessionToken(token) : null;

  if (!payload) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  req.user = { id: payload.sub, studioId: payload.studioId, role: payload.role };
  next();
}
