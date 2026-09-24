/**
 * Bootstraps a brand-new, empty database with the one thing that can't come
 * from a migration: the tenant, its roles, their capability grants, and a
 * single admin account to sign in with. Every migration since 0000 assumes
 * a tenant already exists (this app's original tenant was created ad hoc,
 * before any of this session's work) -- there was no reusable script for
 * this until now.
 *
 * Run once against a fresh, already-migrated database:
 *   pnpm run seed
 *
 * Prints a random temporary password ONCE. Nothing in this script accepts
 * or hardcodes a real password -- generating and printing it is the only
 * way to hand over a working login without a human typing a secret into a
 * form on this script's behalf.
 */
import * as crypto from "crypto";
import * as argon2 from "argon2";
import { prisma } from "./index";

const TENANT_NAME = "Symbiosys Technologies";
const TENANT_SLUG = "symbiosys-technologies";
const ADMIN_EMAIL = "pipelinevizag@symbiosystech.com";
const ADMIN_NAME = "Dillip";

const ALL_CAPABILITIES = [
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
] as const;

// Mirrors what this tenant's roles have actually held and been tested
// against all session -- not a guess. admin is deliberately ALL of them
// (migration 0017: this studio's admin absorbs production management --
// migration 0023 went further and removed the separate production_head/
// producer roles entirely, since admin already bypassed every
// leadership-authority check in the approval chain (canApproveAsDeptLead,
// canApproveAsProdManager) and already held every capability either of them
// did -- there was nothing left for a separate top role to do). lead/artist
// include the migration-0018 grants (manage_pipeline, create_tasks
// respectively) alongside their base set. client holds only
// approve_reviews, which a client session uses for annotation creation in
// the review portal, not for anything else.
const ROLE_CAPABILITIES: Record<string, readonly string[]> = {
  admin: ALL_CAPABILITIES,
  lead: ["assign_tasks", "submit_reviews", "approve_reviews", "manage_pipeline"],
  artist: ["submit_reviews", "create_tasks"],
  client: ["approve_reviews"],
};

function randomPassword(): string {
  // 16 random bytes, base64url -- comfortably past the app's 6-char
  // minimum, never reused, never logged anywhere but this one-time stdout
  // line.
  return crypto.randomBytes(16).toString("base64url");
}

async function main() {
  const existing = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
  if (existing) {
    console.error(
      `A tenant with slug "${TENANT_SLUG}" already exists (id ${existing.id}). ` +
        "This script only bootstraps a genuinely empty database -- refusing to run again.",
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.create({
    data: { id: crypto.randomUUID(), name: TENANT_NAME, slug: TENANT_SLUG },
  });

  const roleIds: Record<string, string> = {};
  for (const roleName of Object.keys(ROLE_CAPABILITIES)) {
    const role = await prisma.tenantRole.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        name: roleName,
        isSystemDefault: true,
      },
    });
    roleIds[roleName] = role.id;
  }

  for (const [roleName, capabilityIds] of Object.entries(ROLE_CAPABILITIES)) {
    if (capabilityIds.length === 0) continue;
    await prisma.tenantRoleCapability.createMany({
      data: capabilityIds.map((capabilityId) => ({
        roleId: roleIds[roleName],
        capabilityId,
      })),
    });
  }

  const tempPassword = randomPassword();
  await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      roleId: roleIds.admin,
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      hashedPassword: await argon2.hash(tempPassword),
      status: "active",
    },
  });

  console.log("");
  console.log("Seed complete.");
  console.log(`Tenant: ${TENANT_NAME} (${tenant.id})`);
  console.log(`Admin login: ${ADMIN_EMAIL}`);
  console.log(`Temporary password: ${tempPassword}`);
  console.log("Change this immediately after first login (Settings > your profile).");
  console.log("This password is shown exactly once and is not stored anywhere else.");
  console.log("");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
