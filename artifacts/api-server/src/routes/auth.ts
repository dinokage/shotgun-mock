import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  tenantsTable,
  tenantRolesTable,
  tenantRoleCapabilitiesTable,
  departmentsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyPassword, signSession, verifySession } from "../lib/auth";
import { createNotification, findProductionManagers } from "./notifications";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await verifyPassword(password, user.hashedPassword);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Resolve tenant and role details
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId));
    const [role] = await db
      .select()
      .from(tenantRolesTable)
      .where(eq(tenantRolesTable.id, user.roleId));
    const roleCaps = await db
      .select()
      .from(tenantRoleCapabilitiesTable)
      .where(eq(tenantRoleCapabilitiesTable.roleId, user.roleId));
    const capabilities = roleCaps.map((c) => c.capabilityId);

    const sessionPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      departmentId: user.departmentId,
    };

    const token = signSession(sessionPayload);
    res.cookie("session", token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Fire-and-forget: never let a notification failure block login itself.
    // Skip notifying a production_head that they logged in themselves --
    // that's not a signal anyone (including them) needs to see.
    if (role?.name !== "production_head") {
      (async () => {
        try {
          const [dept] = user.departmentId
            ? await db
                .select()
                .from(departmentsTable)
                .where(eq(departmentsTable.id, user.departmentId!))
            : [];
          const recipients = await findProductionManagers(
            user.tenantId,
            dept?.name,
          );
          for (const recipient of recipients) {
            await createNotification({
              tenantId: user.tenantId,
              recipientUserId: recipient.id,
              category: "system",
              title: `${user.name} logged in`,
              description: `${user.name} (${role?.name || "member"}${dept ? `, ${dept.name}` : ""}) just signed in.`,
              entityType: "user",
              entityId: user.id,
            });
          }
        } catch (err) {
          req.log.error(err, "Failed to send login notification");
        }
      })();
    }

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        role: role?.name || "admin",
        departmentId: user.departmentId,
        capabilities,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie("session");
  return res.status(200).json({ message: "Logged out" });
});

authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const session = verifySession(token);
  if (!session) return res.status(401).json({ error: "Invalid session" });
  // /me is for real-user sessions only; client-access-link sessions carry a
  // null userId and have no users row to look up.
  if (!session.userId) return res.status(401).json({ error: "Invalid session" });

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId));
  if (!user) return res.status(401).json({ error: "User deleted" });

  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, session.tenantId));
  const [role] = await db
    .select()
    .from(tenantRolesTable)
    .where(eq(tenantRolesTable.id, session.roleId));
  const roleCaps = await db
    .select()
    .from(tenantRoleCapabilitiesTable)
    .where(eq(tenantRoleCapabilitiesTable.roleId, session.roleId));
  const capabilities = roleCaps.map((c) => c.capabilityId);

  return res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      role: role?.name || "admin",
      departmentId: user.departmentId,
      capabilities,
    },
    tenant: {
      id: tenant.id,
      name: tenant?.name || "",
    },
  });
});
