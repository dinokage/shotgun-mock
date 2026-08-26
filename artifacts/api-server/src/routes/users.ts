import { Router } from "express";
import { db, usersTable, tenantRolesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { hashPassword } from "../lib/auth";
import * as crypto from "crypto";

const router = Router();

router.use(tenantAuthMiddleware);

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenantId));
    res.json(users.map(({ hashedPassword, ...user }) => user));
  } catch (err) {
    req.log.error(err, "Failed to fetch users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { email, name, password, roleId, title } = req.body;

    if (!email || !name || !password || !roleId) {
      return res
        .status(400)
        .json({ error: "Missing email, name, password, or roleId" });
    }

    // The caller supplies roleId, so it must be proven to belong to the
    // caller's OWN tenant. Without this, a `manage_members` holder in tenant B
    // could pass a roleId from tenant A and mint a user in tenant B whose
    // capability set is defined by a role tenant B does not own.
    const [role] = await db
      .select()
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.id, roleId),
          eq(tenantRolesTable.tenantId, tenantId),
        ),
      );

    if (!role) {
      return res.status(400).json({ error: "Invalid roleId" });
    }

    // usersTable.email is globally unique. Reject duplicates here so the caller
    // gets a clean 409 rather than a raw constraint-violation 500, and so login
    // (which looks users up by email with no tenant scoping) can never become
    // ambiguous between two tenants.
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const hashedPassword = await hashPassword(password);
    const [newUser] = await db
      .insert(usersTable)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        roleId,
        email,
        name,
        title,
        hashedPassword,
      })
      .returning();

    const { hashedPassword: _omit, ...user } = newUser;
    return res.status(201).json(user);
  } catch (err) {
    req.log.error(err, "Failed to create user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
