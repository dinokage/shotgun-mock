import { Request, Response, NextFunction } from "express";
import { prisma } from "@workspace/db";
import { verifySession } from "../lib/auth";
import { cacheGet, cacheSet, cacheKeys } from "../lib/cache";

// How long a request-free gap is tolerated before someone reads as
// "offline" on the roster. Must be a few multiples of PRESENCE_THROTTLE_SECONDS
// below so normal usage (which writes at most once per throttle window) never
// drifts stale between writes.
export const PRESENCE_ONLINE_WINDOW_MS = 90_000;
const PRESENCE_THROTTLE_SECONDS = 45;

/**
 * Best-effort "is this person actually using the app right now" heartbeat.
 * Fires on every authenticated request but writes to Postgres at most once
 * per throttle window per user, using a short Redis flag to skip the write
 * otherwise. Deliberately not awaited by the caller -- presence is a nice-to
 * -have status dot, not something worth adding latency to every request for,
 * and a dropped heartbeat just means the dot goes stale a little early.
 */
function touchPresence(userId: string): void {
  const key = cacheKeys.presenceThrottle(userId);
  cacheGet<boolean>(key)
    .then(async (recent) => {
      if (recent) return;
      await cacheSet(key, true, PRESENCE_THROTTLE_SECONDS);
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      });
    })
    .catch(() => {
      // Presence is best-effort; a failed heartbeat isn't worth surfacing.
    });
}

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      userId?: string;
      roleId?: string;
      departmentId?: string | null;
      clientAccessLinkId?: string;
    }
  }
}

interface SessionValidity {
  tokenVersion: number;
  status: string | null;
}

/**
 * The user's current tokenVersion and account status, cached briefly
 * together so deactivation gets the same fail-closed guarantee as
 * revocation without a second query per request.
 *
 * Fails CLOSED, unlike the rest of the cache layer: if this can't be read
 * the request is rejected. A check that silently passes when the datastore
 * hiccups is not a check -- the whole point is that a logged-out,
 * deactivated, or offboarded session stops working.
 */
async function currentSessionValidity(userId: string): Promise<SessionValidity | null> {
  const key = cacheKeys.tokenVersion(userId);
  const cached = await cacheGet<SessionValidity>(key);
  if (cached && typeof cached.tokenVersion === "number") return cached;

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { tokenVersion: true, status: true },
  });
  if (!user) return null;
  const validity: SessionValidity = { tokenVersion: user.tokenVersion, status: user.status };
  await cacheSet(key, validity, 300);
  return validity;
}

/** Exported for /auth/me, which verifies its own cookie instead of going
 * through this middleware and needs the identical revocation + deactivation
 * check. */
export async function isSessionStillValid(
  userId: string,
  tokenVersion: number,
): Promise<boolean> {
  const v = await currentSessionValidity(userId);
  return !!v && v.tokenVersion === tokenVersion && v.status === "active";
}

export async function tenantAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Try to extract tenant from subdomain if not local
  let tenantSlug = "";
  const host = req.get("host") || "";
  if (host.includes("forgeapp.com")) {
    tenantSlug = host.split(".")[0];
  } else {
    tenantSlug = req.header("X-Tenant-ID") || "";
  }

  // Verify auth session token (usually stored in a cookie named "session")
  const token = req.cookies.session;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const session = verifySession(token);
  if (!session) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  // Cross-tenant breach check.
  // If the user's session tenantId does not match what the API resolves as the current tenant scope,
  // we return 404 per the requirements (to avoid exposing tenant existence).

  // NOTE: For now, we trust the session's tenantId to act as the true tenantId
  req.tenantId = session.tenantId;
  req.userId = session.userId ?? undefined;
  req.roleId = session.roleId;
  req.departmentId = session.departmentId;
  req.clientAccessLinkId = session.clientAccessLinkId;

  // Employee sessions carry a tokenVersion; a mismatch means the token was
  // issued before a logout, password change, role change, or deactivation
  // and is no longer valid, regardless of its 7-day expiry. A deactivated
  // account fails here even with a matching version, so disabling someone
  // takes effect on their very next request, not just their next login.
  // Client-access sessions have no user row -- they are revoked through
  // their link instead (getClientScope).
  if (session.userId) {
    if (!(await isSessionStillValid(session.userId, session.tv ?? 0))) {
      res.status(401).json({ error: "Session expired" });
      return;
    }
    touchPresence(session.userId);
  }

  next();
}
