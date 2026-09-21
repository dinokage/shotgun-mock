import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess } from "../middleware/rbac";
import { generateApiToken, hashApiToken } from "../lib/auth";
import * as crypto from "crypto";

// DCC integration (Maya/Blender/Nuke plugins, and anything else that
// authenticates with a personal token) is admin-only studio-wide -- Settings
// hides this tab from everyone else, but that's a UI convenience, not a
// boundary. Without this, any authenticated non-admin could mint themselves
// a live bearer token via POST here directly, bypassing the visibility gate
// entirely (found by a live test: an "artist" account got a 201 and a real
// token from this endpoint before this check existed).
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = await prisma.tenantRole.findFirst({
    where: { id: req.roleId!, tenantId: req.tenantId! },
    select: { name: true },
  });
  if (role?.name !== "admin") {
    res.status(403).json({ error: "Forbidden: DCC integration tokens are admin-only" });
    return;
  }
  next();
}

/**
 * Self-service personal access tokens for DCC plugins (Maya/Blender/Nuke)
 * and other scripts -- see lib/auth.ts's generateApiToken/hashApiToken and
 * middleware/tenant.ts's tryTokenAuth for how a token then authenticates a
 * request. A person manages only their own tokens; there is no admin view
 * of anyone else's (the row itself carries no secret to protect beyond the
 * hash, but who created what stays private the same way a password does).
 */
export const apiTokensRouter = Router();

apiTokensRouter.use(tenantAuthMiddleware);
apiTokensRouter.use(denyClientAccess);
apiTokensRouter.use(requireAdmin);

// Barred from token-authenticated requests: a leaked token could otherwise
// mint itself unlimited replacements, or revoke sibling tokens, extending
// its own reach past whatever it originally had.
function requireCookieAuth(req: Request, res: Response, next: NextFunction) {
  if (req.authMethod !== "cookie") {
    res.status(403).json({
      error: "This action requires signing in through the app -- an API token can't manage tokens.",
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
      select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true },
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
      where: { id: req.params.id as string, tenantId: req.tenantId!, userId: req.userId! },
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
