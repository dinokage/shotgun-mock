// One-time bootstrap: wipes every tenant-scoped row in the database (a
// true blank slate — no pre-seeded admin) and creates exactly one tenant,
// one admin role with every capability, and one admin user. Deliberately
// separate from seed.ts, which stays the demo-data-for-local-dev tool it
// already is — this script is for the real "start from nothing, I am the
// only admin" moment, run once against a target database (local now, the
// company server at deploy time), never as part of the normal seed/migrate
// flow.
//
// The admin password is NEVER hardcoded here and never logged — it is read
// from the ADMIN_BOOTSTRAP_PASSWORD environment variable at run time only,
// hashed with the same argon2 hashPassword() helper every other user's
// password goes through (artifacts/api-server/src/lib/auth.ts), and the
// plaintext value is discarded the moment this process exits.
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantRolesTable,
  tenantRoleCapabilitiesTable,
  usersTable,
} from "@workspace/db/schema";
import * as argon2 from "argon2";
import * as crypto from "crypto";

// Matches artifacts/api-server/src/lib/auth.ts's hashPassword() exactly
// (argon2.hash with library defaults) — duplicated inline here rather than
// cross-imported from another workspace package's src/, which pnpm
// workspaces don't resolve cleanly for a plain relative import.
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

const ADMIN_EMAIL = "krishna.akshath11@gmail.com";
const ADMIN_NAME = "Krishna Akshath";
const TENANT_NAME = "Nebula Animation Co.";
const TENANT_SLUG = "nebula";

// Matches artifacts/forge/src/store/permissions.ts's DEFAULT_PERMISSION_SCHEME
// exactly. This app's RBAC logic (Role type, DEPARTMENT_LEADERSHIP_ROLES,
// STUDIO_LEADERSHIP_ROLES, capability defaults, every route's
// requireCapability check) is hardcoded around these six specific role
// names -- there is no role-creation UI anywhere in the app (checked before
// writing this), so a blank-slate reset that only creates "admin" leaves the
// admin with no other role to invite or create a user into. All six roles
// must exist from the start; zero USERS in them is what "blank slate" means
// here, not "the role system itself is missing."
const ROLE_CAPABILITIES: Record<string, readonly string[]> = {
  admin: [
    "create_tasks",
    "edit_tasks",
    "delete_tasks",
    "assign_tasks",
    "submit_reviews",
    "approve_reviews",
    "manage_members",
    "manage_roles",
    "view_financials",
    "edit_financials",
    "manage_pipeline",
    "manage_licenses",
    "manage_integrations",
    "broadcast_updates",
  ],
  production_head: [
    "create_tasks",
    "edit_tasks",
    "delete_tasks",
    "assign_tasks",
    "submit_reviews",
    "approve_reviews",
    "view_financials",
    "edit_financials",
    "manage_pipeline",
    "broadcast_updates",
  ],
  producer: [
    "create_tasks",
    "edit_tasks",
    "assign_tasks",
    "submit_reviews",
    "approve_reviews",
    "manage_pipeline",
    "broadcast_updates",
  ],
  lead: [
    "create_tasks",
    "edit_tasks",
    "assign_tasks",
    "submit_reviews",
    "approve_reviews",
  ],
  artist: ["edit_tasks", "submit_reviews"],
  client: ["approve_reviews"],
};

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error(
      "CRITICAL: This script can only be run in development environment.",
    );
    process.exit(1);
  }

  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password) {
    console.error(
      "CRITICAL: Set ADMIN_BOOTSTRAP_PASSWORD in the environment before running this script. It is never hardcoded here.",
    );
    process.exit(1);
  }

  console.log(
    "Wiping every tenant-scoped table (cascades from tenants)...",
  );
  // Every content/RBAC table in this schema has a tenantId FK with
  // onDelete: "cascade" (verified against every schema file before writing
  // this script) — deleting every tenant row cascades the wipe through
  // departments, users, roles/capabilities, projects, episodes, sequences,
  // shots, assets, tasks (+ checklist/dependencies/comments/attachments/
  // approval-events), versions, reviews, annotations, daily logs, and
  // client access links in one operation, with no risk of missing a table
  // or getting delete order wrong across 20+ tables by hand.
  await db.delete(tenantsTable);

  console.log("Creating tenant, all six standard roles, and the admin user...");
  const tenantId = crypto.randomUUID();
  await db.insert(tenantsTable).values({
    id: tenantId,
    name: TENANT_NAME,
    slug: TENANT_SLUG,
  });

  const roleIdByName: Record<string, string> = {};
  for (const [roleName, capabilities] of Object.entries(ROLE_CAPABILITIES)) {
    const roleId = crypto.randomUUID();
    roleIdByName[roleName] = roleId;
    await db.insert(tenantRolesTable).values({
      id: roleId,
      tenantId,
      name: roleName,
      isSystemDefault: true,
    });
    await db.insert(tenantRoleCapabilitiesTable).values(
      capabilities.map((capabilityId) => ({ roleId, capabilityId })),
    );
  }
  const adminRoleId = roleIdByName.admin;

  const hashedPassword = await hashPassword(password);
  await db.insert(usersTable).values({
    id: crypto.randomUUID(),
    tenantId,
    roleId: adminRoleId,
    departmentId: null,
    email: ADMIN_EMAIL,
    hashedPassword,
    name: ADMIN_NAME,
    status: "active",
  });

  console.log(
    `Bootstrap complete. Tenant "${TENANT_NAME}" (${tenantId}) created with all six standard roles and one admin user (${ADMIN_EMAIL}). Every other table is empty. Log in and use the admin panel to invite/add employees and departments.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Reset/bootstrap failed:", err);
  process.exit(1);
});
