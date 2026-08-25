import { db } from "@workspace/db";
import {
  tenantsTable,
  projectsTable,
  usersTable,
  tenantRolesTable,
  tenantRoleCapabilitiesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import * as crypto from "crypto";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error(
      "CRITICAL: Seed script can only be run in development environment.",
    );
    process.exit(1);
  }

  console.log("Starting DB seed...");

  const mockHashedPassword =
    "$argon2id$v=19$m=65536,p=4,t=3$S47zo5bxYnFgICAP+3cAQw$YvpNw85sWi6M9sj+QHapnopiNw+B2iFV8nSG0vNEZSA";

  const tenantId = crypto.randomUUID();
  await db
    .insert(tenantsTable)
    .values({
      id: tenantId,
      name: "Acme VFX",
      slug: "acme",
    })
    .onConflictDoNothing();

  const roles = [
    {
      name: "admin",
      email: "admin@acme.com",
      user: "Acme Admin",
      capabilities: [
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
    },
    {
      name: "vfx_producer",
      email: "producer@acme.com",
      user: "Acme Producer",
      capabilities: [
        "create_tasks",
        "edit_tasks",
        "delete_tasks",
        "assign_tasks",
        "submit_reviews",
        "approve_reviews",
        "manage_members",
        "view_financials",
        "edit_financials",
        "manage_pipeline",
        "manage_licenses",
        "manage_integrations",
        "broadcast_updates",
      ],
    },
    {
      name: "production_manager",
      email: "manager@acme.com",
      user: "Acme Manager",
      capabilities: [
        "create_tasks",
        "edit_tasks",
        "delete_tasks",
        "assign_tasks",
        "submit_reviews",
        "approve_reviews",
        "manage_members",
        "view_financials",
        "edit_financials",
        "manage_pipeline",
        "manage_licenses",
        "broadcast_updates",
      ],
    },
    {
      name: "lead",
      email: "lead@acme.com",
      user: "Acme Lead",
      capabilities: [
        "create_tasks",
        "edit_tasks",
        "assign_tasks",
        "submit_reviews",
        "approve_reviews",
      ],
    },
    {
      name: "artist",
      email: "artist@acme.com",
      user: "Acme Artist",
      capabilities: ["edit_tasks", "submit_reviews"],
    },
    {
      name: "client",
      email: "client@acme.com",
      user: "Acme Client",
      capabilities: ["approve_reviews"],
    },
  ];

  for (const roleDef of roles) {
    const roleId = crypto.randomUUID();
    await db
      .insert(tenantRolesTable)
      .values({
        id: roleId,
        tenantId: tenantId,
        name: roleDef.name,
        isSystemDefault: true,
      })
      .onConflictDoNothing();

    // In a real app we'd fetch the roleId if onConflictDoNothing prevented insert,
    // but for a clean seed script we can just use a deterministic UUID or wipe db first.
    // Let's assume clean DB or we can query it:
    // @ts-ignore
    const [insertedRole] = await db
      .select()
      .from(tenantRolesTable)
      .where(eq(tenantRolesTable.name, roleDef.name));

    for (const cap of roleDef.capabilities) {
      await db
        .insert(tenantRoleCapabilitiesTable)
        .values({
          roleId: insertedRole.id,
          capabilityId: cap,
        })
        .onConflictDoNothing();
    }

    await db
      .insert(usersTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantId,
        roleId: insertedRole.id,
        email: roleDef.email,
        name: roleDef.user,
        hashedPassword: mockHashedPassword,
      })
      .onConflictDoNothing();
  }

  console.log("DB seed completed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
