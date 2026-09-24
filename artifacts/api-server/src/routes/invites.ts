import { Router } from "express";
import { prisma } from "@workspace/db";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { hashPassword, signSession } from "../lib/auth";
import { sendInviteEmail } from "../lib/mailer";
import { rateLimitByIp } from "../lib/rateLimit";

// Invite tokens are 256-bit, but accepting one creates a user account, so the
// endpoint gets a ceiling like every other unauthenticated write.
const INVITE_ACCEPT_RULE = {
  name: "invite-accept:ip",
  limit: 10,
  windowSeconds: 3600,
};

export const invitesRouter = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/invites
 *
 * Outstanding invitations. Without this an administrator could send an invite
 * and then had no way to find out whether it existed, who it went to, or
 * whether it had already expired -- so a new starter saying "I never got the
 * email" had no answer but to send another and hope.
 *
 * The token is deliberately NOT returned. It is the credential: anyone
 * holding it can create an account as the role it names, so a list endpoint
 * that included it would turn "may manage members" into "may mint an account
 * for any pending invitation at will, silently". `expired` is derived here so
 * the caller reads a state rather than re-implementing the comparison.
 */
invitesRouter.get(
  "/",
  tenantAuthMiddleware,
  requireCapability("manage_members"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const rows = await prisma.pendingInvite.findMany({
        where: { tenantId },
        select: {
          id: true,
          email: true,
          roleId: true,
          departmentId: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const now = Date.now();
      return res.json(
        rows.map((r) => ({ ...r, expired: r.expiresAt.getTime() < now })),
      );
    } catch (err) {
      req.log.error(err, "Failed to list pending invites");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * DELETE /api/invites/:id
 *
 * Revokes an invitation that has not been accepted -- someone who left before
 * starting, or an address typed wrong. Deleting the row invalidates the token,
 * since acceptance looks it up by exact match.
 */
invitesRouter.delete(
  "/:id",
  tenantAuthMiddleware,
  requireCapability("manage_members"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const deleted = await prisma.pendingInvite.deleteMany({
        where: { id: String(req.params.id), tenantId },
      });
      if (deleted.count === 0) {
        return res.status(404).json({ error: "Not found" });
      }
      return res.status(204).end();
    } catch (err) {
      req.log.error(err, "Failed to revoke invite");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Only the "create and send" step requires an authenticated admin session --
// applied per-route rather than router.use(), since the accept flow below
// runs before the invitee has any session at all (same reasoning as
// client-access.ts's /redeem route).
invitesRouter.post(
  "/",
  tenantAuthMiddleware,
  requireCapability("manage_members"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const { email, roleId, departmentId, projectId } = req.body;
      if (!email || typeof email !== "string" || !roleId)
        return res.status(400).json({ error: "email and roleId are required" });

      const role = await prisma.tenantRole.findFirst({
        where: { id: roleId, tenantId },
        select: { id: true, name: true },
      });
      if (!role) return res.status(400).json({ error: "Invalid roleId" });

      if (departmentId) {
        const dept = await prisma.department.findFirst({
          where: { id: departmentId, tenantId },
          select: { id: true },
        });
        if (!dept)
          return res.status(400).json({ error: "Invalid departmentId" });
      }

      // Only meaningful (and only accepted) for a client-role invite -- see
      // the PendingInvite.projectId schema comment. A non-client role with a
      // projectId set would silently do nothing on accept, which is worse
      // than rejecting it outright here.
      if (projectId) {
        if (role.name !== "client") {
          return res
            .status(400)
            .json({ error: "projectId is only valid for a client invite" });
        }
        const project = await prisma.project.findFirst({
          where: { id: projectId, tenantId },
          select: { id: true },
        });
        if (!project)
          return res.status(400).json({ error: "Invalid projectId" });
      }

      const existingUser = await prisma.user.findFirst({
        where: { email },
        select: { id: true },
      });
      if (existingUser)
        return res
          .status(409)
          .json({ error: "A user with this email already exists" });

      const tenant = await prisma.tenant.findFirst({
        where: { id: tenantId },
        select: { name: true },
      });

      const token = crypto.randomBytes(32).toString("hex");
      await prisma.pendingInvite.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          email,
          roleId,
          departmentId: departmentId ?? null,
          projectId: projectId ?? null,
          invitedByUserId: req.userId!,
          token,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      });

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost";
      const inviteUrl = `${frontendUrl}/accept-invite?token=${token}`;

      // The invite row above is already committed and already valid --
      // whoever holds inviteUrl can accept it regardless of whether this
      // email ever arrives. Letting an SMTP failure (bad credentials, the
      // provider down, a transient network blip) throw past that point used
      // to 500 the whole request, which read as "nothing happened" to the
      // admin even though a real, usable invite now exists with no way to
      // reach it except a raw DB read. Surfacing inviteUrl here instead lets
      // the admin share it manually the moment sending fails.
      let emailSent = true;
      try {
        await sendInviteEmail({
          to: email,
          inviteUrl,
          roleName: role.name,
          tenantName: tenant?.name ?? "Forge",
        });
      } catch (emailErr) {
        emailSent = false;
        req.log.error(emailErr, "Invite created but the email failed to send");
      }

      return res.status(201).json({
        email,
        roleId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        emailSent,
        ...(emailSent ? {} : { inviteUrl }),
      });
    } catch (err) {
      req.log.error(err, "Failed to create invite");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Public: the invitee has no session yet.
invitesRouter.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await prisma.pendingInvite.findFirst({
      where: { token, expiresAt: { gt: new Date() } },
      select: { email: true, tenantId: true, roleId: true, expiresAt: true },
    });
    if (!invite)
      return res.status(404).json({ error: "Invalid or expired invite" });

    const role = await prisma.tenantRole.findFirst({
      where: { id: invite.roleId },
      select: { name: true },
    });
    const tenant = await prisma.tenant.findFirst({
      where: { id: invite.tenantId },
      select: { name: true },
    });

    return res.json({
      email: invite.email,
      roleName: role?.name ?? "member",
      tenantName: tenant?.name ?? "Forge",
    });
  } catch (err) {
    req.log.error(err, "Failed to look up invite");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Public: creates the real user, consumes the invite, and signs the invitee
// straight into a session -- same "no password/email step, land them in the
// app" shape as client-access.ts's /redeem, just for a real employee login
// instead of a scoped client session.
invitesRouter.post(
  "/:token/accept",
  rateLimitByIp(INVITE_ACCEPT_RULE),
  async (req, res) => {
    try {
      const { token } = req.params;
      const { name, password } = req.body;
      if (
        !name ||
        !password ||
        typeof password !== "string" ||
        password.length < 8
      )
        return res
          .status(400)
          .json({ error: "name and a password (min 8 chars) are required" });

      const invite = await prisma.pendingInvite.findFirst({
        where: { token: String(token), expiresAt: { gt: new Date() } },
      });
      if (!invite)
        return res.status(404).json({ error: "Invalid or expired invite" });

      const hashedPassword = await hashPassword(password);
      const userId = crypto.randomUUID();
      await prisma.user.create({
        data: {
          id: userId,
          tenantId: invite.tenantId,
          roleId: invite.roleId,
          departmentId: invite.departmentId,
          email: invite.email,
          hashedPassword,
          name,
          status: "active",
        },
      });

      // A client invite created with a project pre-selected grants it the
      // moment the account exists -- otherwise inviting a client is two
      // disconnected steps (invite here, then separately find them in Client
      // Access to grant a project). grantedByUserId falls back to the new
      // user's own id on the rare chance invitedByUserId wasn't captured (an
      // invite sent before this column existed) -- never null, since every
      // other ClientProjectAccess row attributes a real granter.
      if (invite.projectId) {
        await prisma.clientProjectAccess.create({
          data: {
            id: crypto.randomUUID(),
            tenantId: invite.tenantId,
            userId,
            projectId: invite.projectId,
            grantedByUserId: invite.invitedByUserId ?? userId,
          },
        });
      }

      await prisma.pendingInvite.deleteMany({ where: { id: invite.id } });

      const sessionToken = signSession({
        userId,
        tenantId: invite.tenantId,
        roleId: invite.roleId,
        departmentId: invite.departmentId,
      });
      res.cookie("session", sessionToken, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === "true",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.status(201).json({ id: userId, email: invite.email, name });
    } catch (err) {
      req.log.error(err, "Failed to accept invite");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
