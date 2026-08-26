import { Router } from "express";
import { db, usersTable, tenantRolesTable, departmentsTable } from "@workspace/db";
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

    // The client portal is review-only (spec: client feedback routes to the
    // Production Head, who reassigns internally) -- an external client has no
    // legitimate reason to read the studio's internal staff roster, so this
    // is the one role explicitly excluded from an otherwise tenant-wide read.
    const [callerRole] = await db
      .select({ name: tenantRolesTable.name })
      .from(tenantRolesTable)
      .where(eq(tenantRolesTable.id, req.roleId!));
    if (callerRole?.name === "client") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const users = await db
      .select({
        id: usersTable.id,
        tenantId: usersTable.tenantId,
        roleId: usersTable.roleId,
        role: tenantRolesTable.name,
        departmentId: usersTable.departmentId,
        email: usersTable.email,
        name: usersTable.name,
        title: usersTable.title,
        avatar: usersTable.avatar,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .leftJoin(tenantRolesTable, eq(usersTable.roleId, tenantRolesTable.id))
      .where(eq(usersTable.tenantId, tenantId));
    return res.json(users);
  } catch (err) {
    req.log.error(err, "Failed to fetch users");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { email, name, password, roleId, departmentId, title } = req.body;

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

    if (departmentId) {
      const [dept] = await db
        .select()
        .from(departmentsTable)
        .where(
          and(
            eq(departmentsTable.id, departmentId),
            eq(departmentsTable.tenantId, tenantId),
          ),
        );
      if (!dept) {
        return res.status(400).json({ error: "Invalid departmentId" });
      }
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
        departmentId: departmentId ?? null,
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

router.patch("/:id", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: combining requireCapability() (typed against the generic,
    // path-agnostic Express Request) with this route's "/:id" path typing
    // makes TS widen req.params.id to `string | string[]` for overload
    // resolution purposes, even though a plain ":id" segment is always a
    // single string at runtime.
    const userId = req.params.id as string;
    const { roleId, departmentId } = req.body;

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.id, userId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Partial<typeof usersTable.$inferInsert> = {};

    if (roleId !== undefined) {
      const [role] = await db
        .select()
        .from(tenantRolesTable)
        .where(
          and(
            eq(tenantRolesTable.id, roleId),
            eq(tenantRolesTable.tenantId, tenantId),
          ),
        );
      if (!role) return res.status(400).json({ error: "Invalid roleId" });
      updates.roleId = roleId;
    }

    if (departmentId !== undefined) {
      if (departmentId !== null) {
        const [dept] = await db
          .select()
          .from(departmentsTable)
          .where(
            and(
              eq(departmentsTable.id, departmentId),
              eq(departmentsTable.tenantId, tenantId),
            ),
          );
        if (!dept) return res.status(400).json({ error: "Invalid departmentId" });
      }
      updates.departmentId = departmentId;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.id, userId)));

    const [updated] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.id, userId)));
    const { hashedPassword: _omit, ...user } = updated;
    return res.json(user);
  } catch (err) {
    req.log.error(err, "Failed to update user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
