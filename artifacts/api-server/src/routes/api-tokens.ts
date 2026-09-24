import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess, requireCapability } from "../middleware/rbac";
import { generateApiToken, hashApiToken } from "../lib/auth";
import * as crypto from "crypto";

/**
 * Self-service personal access tokens for DCC plugins (Maya/Blender/Nuke/
 * Houdini) and other scripts -- see lib/auth.ts's generateApiToken/
 * hashApiToken and middleware/tenant.ts's tryTokenAuth for how a token then
 * authenticates a request. A person manages only their own tokens; there is
 * no admin view of anyone else's (the row itself carries no secret to
 * protect beyond the hash, but who created what stays private the same way
 * a password does).
 *
 * Gated on create_tasks, not admin-only: DCC integration is meant for
 * everyone who can already create a shot through the API a plugin calls
 * (artists, leads, admin -- the same set create_tasks already covers, see
 * routes/shots.ts's own gate on POST /). Was admin-only for a stretch of
 * this project's early rollout, deliberately reversed once DCC plugins were
 * built out for real use by artists, not just admin testing them. Still
 * genuinely gated, not open to every authenticated session: found by an
 * earlier live test that this endpoint had NO check at all before the
 * admin-only version existed, letting anyone mint themselves a live bearer
 * token -- create_tasks keeps that closed while matching who's actually
 * meant to use this now.
 */
export const apiTokensRouter = Router();

apiTokensRouter.use(tenantAuthMiddleware);
apiTokensRouter.use(denyClientAccess);
apiTokensRouter.use(requireCapability("create_tasks"));

// Barred from token-authenticated requests: a leaked token could otherwise
// mint itself unlimited replacements, or revoke sibling tokens, extending
// its own reach past whatever it originally had.
function requireCookieAuth(req: Request, res: Response, next: NextFunction) {
  if (req.authMethod !== "cookie") {
    res.status(403).json({
      error:
        "This action requires signing in through the app -- an API token can't manage tokens.",
    });
    return;
  }
  next();
}
apiTokensRouter.use(requireCookieAuth);

apiTokensRouter.get("/", async (req, res) => {
  try {
    const rows = await prisma.apiToken.findMany({
      where: { tenantId: req.tenantId!, userId: req.userId! },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to list API tokens");
    return res.status(500).json({ error: "Internal server error" });
  }
});

apiTokensRouter.post("/", async (req, res) => {
  try {
    const { label } = req.body ?? {};
    if (typeof label !== "string" || !label.trim()) {
      return res.status(400).json({ error: "label is required" });
    }

    const rawToken = generateApiToken();
    const created = await prisma.apiToken.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: req.tenantId!,
        userId: req.userId!,
        tokenHash: hashApiToken(rawToken),
        label: label.trim(),
      },
      select: { id: true, label: true, createdAt: true },
    });

    // The only time the raw value is ever knowable -- not stored, not
    // retrievable again, same as a password reset link.
    return res.status(201).json({ ...created, token: rawToken });
  } catch (err) {
    req.log.error(err, "Failed to create API token");
    return res.status(500).json({ error: "Internal server error" });
  }
});

apiTokensRouter.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.apiToken.findFirst({
      where: {
        id: req.params.id as string,
        tenantId: req.tenantId!,
        userId: req.userId!,
      },
      select: { id: true, revokedAt: true },
    });
    if (!existing) return res.status(404).json({ error: "Token not found" });
    if (!existing.revokedAt) {
      await prisma.apiToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to revoke API token");
    return res.status(500).json({ error: "Internal server error" });
  }
});
