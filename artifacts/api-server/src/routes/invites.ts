import { Router } from "express";
import { db } from "@workspace/db";
import {
  pendingInvitesTable,
  usersTable,
  tenantRolesTable,
  tenantsTable,
} from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { hashPassword, signSession } from "../lib/auth";
import { sendInviteEmail } from "../lib/mailer";

export const invitesRouter = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
      const { email, roleId } = req.body;
      if (!email || typeof email !== "string" || !roleId)
        return res.status(400).json({ error: "email and roleId are required" });

      const [role] = await db
        .select({ id: tenantRolesTable.id, name: tenantRolesTable.name })
        .from(tenantRolesTable)
        .where(
          and(
            eq(tenantRolesTable.id, roleId),
            eq(tenantRolesTable.tenantId, tenantId),
          ),
        );
      if (!role) return res.status(400).json({ error: "Invalid roleId" });

      const [existingUser] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email));
      if (existingUser)
        return res.status(409).json({ error: "A user with this email already exists" });

      const [tenant] = await db
        .select({ name: tenantsTable.name })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId));

      const token = crypto.randomBytes(32).toString("hex");
      await db.insert(pendingInvitesTable).values({
        id: crypto.randomUUID(),
        tenantId,
        email,
        roleId,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost";
      const inviteUrl = `${frontendUrl}/accept-invite?token=${token}`;
      await sendInviteEmail({
        to: email,
        inviteUrl,
        roleName: role.name,
        tenantName: tenant?.name ?? "Forge",
      });

      return res.status(201).json({ email, roleId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
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
    const [invite] = await db
      .select({
        email: pendingInvitesTable.email,
        tenantId: pendingInvitesTable.tenantId,
        roleId: pendingInvitesTable.roleId,
        expiresAt: pendingInvitesTable.expiresAt,
      })
      .from(pendingInvitesTable)
      .where(
        and(
          eq(pendingInvitesTable.token, token),
          gt(pendingInvitesTable.expiresAt, new Date()),
        ),
      );
    if (!invite) return res.status(404).json({ error: "Invalid or expired invite" });

    const [role] = await db
      .select({ name: tenantRolesTable.name })
      .from(tenantRolesTable)
      .where(eq(tenantRolesTable.id, invite.roleId));
    const [tenant] = await db
      .select({ name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, invite.tenantId));

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
invitesRouter.post("/:token/accept", async (req, res) => {
  try {
    const { token } = req.params;
    const { name, password } = req.body;
    if (!name || !password || typeof password !== "string" || password.length < 8)
      return res.status(400).json({ error: "name and a password (min 8 chars) are required" });

    const [invite] = await db
      .select()
      .from(pendingInvitesTable)
      .where(
        and(
          eq(pendingInvitesTable.token, token),
          gt(pendingInvitesTable.expiresAt, new Date()),
        ),
      );
    if (!invite) return res.status(404).json({ error: "Invalid or expired invite" });

    const hashedPassword = await hashPassword(password);
    const userId = crypto.randomUUID();
    await db.insert(usersTable).values({
      id: userId,
      tenantId: invite.tenantId,
      roleId: invite.roleId,
      departmentId: null,
      email: invite.email,
      hashedPassword,
      name,
      status: "active",
    });

    await db
      .delete(pendingInvitesTable)
      .where(eq(pendingInvitesTable.id, invite.id));

    const sessionToken = signSession({
      userId,
      tenantId: invite.tenantId,
      roleId: invite.roleId,
      departmentId: null,
    });
    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({ id: userId, email: invite.email, name });
  } catch (err) {
    req.log.error(err, "Failed to accept invite");
    return res.status(500).json({ error: "Internal server error" });
  }
});
