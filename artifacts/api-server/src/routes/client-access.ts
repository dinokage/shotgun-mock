import { Router } from "express";
import { db } from "@workspace/db";
import {
  clientAccessLinksTable,
  tenantRolesTable,
  versionsTable,
  projectsTable,
  episodesTable,
} from "@workspace/db/schema";
import { eq, and, isNull, or, gt } from "drizzle-orm";
import { signSession } from "../lib/auth";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
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

    const [link] = await db
      .select()
      .from(clientAccessLinksTable)
      .where(
        and(
          eq(clientAccessLinksTable.code, code),
          isNull(clientAccessLinksTable.revokedAt),
          or(
            isNull(clientAccessLinksTable.expiresAt),
            gt(clientAccessLinksTable.expiresAt, new Date()),
          ),
        ),
      );
    if (!link) return res.status(401).json({ error: "Invalid or expired code" });

    // Every tenant is seeded with a system-default "client" role (Task 6's
    // sibling task in the admin-bootstrap plan ensures this — for now,
    // fall back to a 401 if a tenant somehow has none, rather than
    // fabricating a roleId that doesn't exist and would break every
    // downstream tenantRoleCapabilities lookup).
    const [clientRole] = await db
      .select({ id: tenantRolesTable.id })
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.tenantId, link.tenantId),
          eq(tenantRolesTable.name, "client"),
        ),
      );
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
// not the client's own redemption -- requires a real logged-in session.
clientAccessRouter.use(tenantAuthMiddleware);

// Exactly one of projectId/episodeId/versionId identifies what this link
// grants -- the narrowest one given wins, matching the schema comment.
async function scopeInTenant(
  tenantId: string,
  scope: { projectId?: string; episodeId?: string; versionId?: string },
): Promise<boolean> {
  if (scope.versionId) {
    const [row] = await db
      .select({ id: versionsTable.id })
      .from(versionsTable)
      .where(and(eq(versionsTable.id, scope.versionId), eq(versionsTable.tenantId, tenantId)));
    return !!row;
  }
  if (scope.episodeId) {
    const [row] = await db
      .select({ id: episodesTable.id })
      .from(episodesTable)
      .where(and(eq(episodesTable.id, scope.episodeId), eq(episodesTable.tenantId, tenantId)));
    return !!row;
  }
  if (scope.projectId) {
    const [row] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, scope.projectId), eq(projectsTable.tenantId, tenantId)));
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
      const scopeColumn = versionId
        ? eq(clientAccessLinksTable.versionId, versionId)
        : episodeId
          ? eq(clientAccessLinksTable.episodeId, episodeId)
          : eq(clientAccessLinksTable.projectId, projectId);
      const [existing] = await db
        .select()
        .from(clientAccessLinksTable)
        .where(
          and(
            eq(clientAccessLinksTable.tenantId, tenantId),
            scopeColumn,
            isNull(clientAccessLinksTable.revokedAt),
            or(
              isNull(clientAccessLinksTable.expiresAt),
              gt(clientAccessLinksTable.expiresAt, new Date()),
            ),
          ),
        );
      if (existing) return res.status(200).json(existing);

      const newId = crypto.randomUUID();
      const code = generateAccessCode();
      await db.insert(clientAccessLinksTable).values({
        id: newId,
        tenantId,
        code,
        projectId: projectId || null,
        episodeId: episodeId || null,
        versionId: versionId || null,
        createdByUserId: userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      const [created] = await db
        .select()
        .from(clientAccessLinksTable)
        .where(and(eq(clientAccessLinksTable.tenantId, tenantId), eq(clientAccessLinksTable.id, newId)));
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
      const conditions = [eq(clientAccessLinksTable.tenantId, tenantId)];
      if (typeof projectId === "string")
        conditions.push(eq(clientAccessLinksTable.projectId, projectId));
      if (typeof episodeId === "string")
        conditions.push(eq(clientAccessLinksTable.episodeId, episodeId));
      if (typeof versionId === "string")
        conditions.push(eq(clientAccessLinksTable.versionId, versionId));
      const rows = await db
        .select()
        .from(clientAccessLinksTable)
        .where(and(...conditions));
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
      const [existing] = await db
        .select()
        .from(clientAccessLinksTable)
        .where(
          and(
            eq(clientAccessLinksTable.tenantId, tenantId),
            eq(clientAccessLinksTable.id, linkId),
          ),
        );
      if (!existing) return res.status(404).json({ error: "Not found" });
      await db
        .update(clientAccessLinksTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(clientAccessLinksTable.tenantId, tenantId),
            eq(clientAccessLinksTable.id, linkId),
          ),
        );
      return res.status(204).send();
    } catch (err) {
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
