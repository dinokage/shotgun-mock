import { Router } from "express";
import { prisma } from "@workspace/db";
import { signSession } from "../lib/auth";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

export const clientAccessRouter = Router();

// Deliberately excludes visually ambiguous characters (0/O, 1/I/L) -- a
// client has to type this by hand from an email or chat message.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateAccessCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Unauthenticated on purpose -- a client has no Forge account, only the
// code. Declared before the tenantAuthMiddleware below so it's matched
// first and never runs through it (router middleware only applies to
// routes registered after it).
clientAccessRouter.post("/redeem", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string")
      return res.status(400).json({ error: "Missing code" });

    const link = await prisma.clientAccessLink.findFirst({
      where: {
        code,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!link) return res.status(401).json({ error: "Invalid or expired code" });

    // Every tenant is seeded with a system-default "client" role (Task 6's
    // sibling task in the admin-bootstrap plan ensures this — for now,
    // fall back to a 401 if a tenant somehow has none, rather than
    // fabricating a roleId that doesn't exist and would break every
    // downstream tenantRoleCapabilities lookup).
    const clientRole = await prisma.tenantRole.findFirst({
      where: { tenantId: link.tenantId, name: "client" },
      select: { id: true },
    });
    if (!clientRole)
      return res.status(500).json({ error: "Tenant has no client role configured" });

    const token = signSession({
      userId: null,
      tenantId: link.tenantId,
      roleId: clientRole.id,
      departmentId: null,
      clientAccessLinkId: link.id,
    });

    // Cookie options copied verbatim from routes/auth.ts's login handler so
    // this session cookie is parsed consistently with the rest of the app.
    res.cookie("session", token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({
      scope: {
        projectId: link.projectId,
        episodeId: link.episodeId,
        versionId: link.versionId,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Every route below this point is a producer/lead-facing management route,
// not the client's own redemption -- requires a real logged-in employee
// session. tenantAuthMiddleware alone doesn't enforce that (it accepts any
// valid session, client-access sessions included) -- denyClientAccess closes
// that gap. Without it, a client session (which holds approve_reviews for an
// unrelated reason -- see the comment below) could pass requireCapability on
// POST / below and mint itself a fresh access link scoped to anything in the
// tenant, not just what it was originally given.
clientAccessRouter.use(tenantAuthMiddleware);
clientAccessRouter.use(denyClientAccess);

// Exactly one of projectId/episodeId/versionId identifies what this link
// grants -- the narrowest one given wins, matching the schema comment.
async function scopeInTenant(
  tenantId: string,
  scope: { projectId?: string; episodeId?: string; versionId?: string },
): Promise<boolean> {
  if (scope.versionId) {
    const row = await prisma.version.findFirst({
      where: { id: scope.versionId, tenantId },
      select: { id: true },
    });
    return !!row;
  }
  if (scope.episodeId) {
    const row = await prisma.episode.findFirst({
      where: { id: scope.episodeId, tenantId },
      select: { id: true },
    });
    return !!row;
  }
  if (scope.projectId) {
    const row = await prisma.project.findFirst({
      where: { id: scope.projectId, tenantId },
      select: { id: true },
    });
    return !!row;
  }
  return false;
}

// Creates (or reuses) a client access link/code for one project/episode/
// version. Gated on approve_reviews -- the same capability that lets
// someone sign off on a submission in the review chain, since sharing
// footage with the client is the natural next step after approval, not a
// separate permission tier. Real producers/leads only; the admin role no
// longer holds this capability by design (view-only).
clientAccessRouter.post(
  "/",
  requireCapability("approve_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { projectId, episodeId, versionId, expiresAt } = req.body;
      const scope = { projectId, episodeId, versionId };
      const scopeCount = [projectId, episodeId, versionId].filter(Boolean).length;
      if (scopeCount !== 1) {
        return res
          .status(400)
          .json({ error: "Provide exactly one of projectId, episodeId, or versionId" });
      }
      if (!(await scopeInTenant(tenantId, scope))) {
        return res.status(400).json({ error: "Invalid project, episode, or version" });
      }

      // Reuse an existing, still-valid link for this exact scope instead of
      // minting a new code every time someone clicks "Share with Client" --
      // otherwise re-sharing the same version invalidates nothing but does
      // leave a trail of dead codes, and confuses a client who reuses an
      // old email with an old code that still needs to work.
      const scopeWhere = versionId
        ? { versionId }
        : episodeId
          ? { episodeId }
          : { projectId };
      const existing = await prisma.clientAccessLink.findFirst({
        where: {
          tenantId,
          ...scopeWhere,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (existing) return res.status(200).json(existing);

      const created = await prisma.clientAccessLink.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          code: generateAccessCode(),
          projectId: projectId || null,
          episodeId: episodeId || null,
          versionId: versionId || null,
          createdByUserId: userId,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });
      return res.status(201).json(created);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Lists this tenant's client access links, optionally scoped to one
// project/episode/version -- lets a reviewer see whether a link already
// exists for what they're looking at, and what code it carries, without
// creating a duplicate.
clientAccessRouter.get(
  "/",
  requireCapability("approve_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const { projectId, episodeId, versionId } = req.query;
      const rows = await prisma.clientAccessLink.findMany({
        where: {
          tenantId,
          ...(typeof projectId === "string" ? { projectId } : {}),
          ...(typeof episodeId === "string" ? { episodeId } : {}),
          ...(typeof versionId === "string" ? { versionId } : {}),
        },
      });
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Revokes a client access link -- the client's already-established
// sessions stay valid until they expire naturally (the session JWT itself
// isn't checked against revokedAt on every request), but /redeem will
// refuse the code from this point on, so it can't be used again or shared
// further.
clientAccessRouter.delete(
  "/:id",
  requireCapability("approve_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      // Cast needed: combining requireCapability() (typed against the
      // generic, path-agnostic Express Request) with this route's "/:id"
      // path typing makes TS widen req.params.id to `string | string[]`
      // for overload resolution purposes, even though a plain ":id"
      // segment is always a single string at runtime (same issue already
      // documented in routes/users.ts's PATCH /:id).
      const linkId = req.params.id as string;
      const existing = await prisma.clientAccessLink.findFirst({
        where: { tenantId, id: linkId },
      });
      if (!existing) return res.status(404).json({ error: "Not found" });
      await prisma.clientAccessLink.updateMany({
        where: { tenantId, id: linkId },
        data: { revokedAt: new Date() },
      });
      return res.status(204).send();
    } catch (err) {
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
