import { db } from "@workspace/db";
import {
  tenantsTable,
  departmentsTable,
  projectsTable,
  usersTable,
  tenantRolesTable,
  tenantRoleCapabilitiesTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
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

  await db
    .insert(tenantsTable)
    .values({ id: crypto.randomUUID(), name: "Acme VFX", slug: "acme" })
    .onConflictDoNothing();

  // Mirror the role-insertion pattern below: onConflictDoNothing() alone
  // doesn't tell us the id of a tenant that already existed, so re-query by
  // the unique slug to get the real row's id whether it was just inserted or
  // already there. Without this, a locally-generated tenantId that never
  // actually got persisted (because the slug already existed) would orphan
  // every downstream insert with a foreign-key violation.
  const [insertedTenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, "acme"));
  const tenantId = insertedTenant.id;

  await db
    .insert(projectsTable)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      name: "Starfall",
      status: "active",
    })
    .onConflictDoNothing();

  const deptDefs = [
    { name: "Production Management", abbr: "PROD", pipeline: "PROD", pipelineOrder: 0, color: "#636e72", icon: "Briefcase" },
    { name: "Modeling", abbr: "MDL", pipeline: "3D", pipelineOrder: 1, color: "#4facfe", icon: "Box" },
    { name: "Texturing / LookDev", abbr: "TEX", pipeline: "3D", pipelineOrder: 2, color: "#a55eea", icon: "Paintbrush" },
    { name: "Rigging", abbr: "RIG", pipeline: "3D", pipelineOrder: 3, color: "#4ecdc4", icon: "Bone" },
    { name: "Layout", abbr: "LAY", pipeline: "3D", pipelineOrder: 4, color: "#fdcb6e", icon: "Layout" },
    { name: "Animation", abbr: "ANIM", pipeline: "3D", pipelineOrder: 5, color: "#fd79a8", icon: "Clapperboard" },
    { name: "Lighting", abbr: "LIT", pipeline: "3D", pipelineOrder: 6, color: "#0984e3", icon: "Sun" },
    { name: "Rendering", abbr: "RND", pipeline: "3D", pipelineOrder: 7, color: "#dfe6e9", icon: "MonitorPlay" },
    { name: "Matchmove / Camera Tracking", abbr: "TRK", pipeline: "VFX", pipelineOrder: 8, color: "#00cec9", icon: "Crosshair" },
    { name: "Rotomation", abbr: "RTM", pipeline: "VFX", pipelineOrder: 9, color: "#81ecec", icon: "Activity" },
    { name: "Creature Effects (CFX)", abbr: "CFX", pipeline: "VFX", pipelineOrder: 10, color: "#ff6b6b", icon: "Bug" },
    { name: "FX Simulations", abbr: "FX", pipeline: "VFX", pipelineOrder: 11, color: "#ff9f43", icon: "Flame" },
    { name: "Grooming", abbr: "GRM", pipeline: "VFX", pipelineOrder: 12, color: "#fab1a0", icon: "Scissors" },
    { name: "Rotoscoping (Roto)", abbr: "ROTO", pipeline: "2D", pipelineOrder: 13, color: "#e17055", icon: "PenTool" },
    { name: "Paint / Prep", abbr: "PNT", pipeline: "2D", pipelineOrder: 14, color: "#ffeaa7", icon: "Brush" },
    { name: "Digital Matte Painting (DMP)", abbr: "DMP", pipeline: "2D", pipelineOrder: 15, color: "#00b894", icon: "Mountain" },
    { name: "2D Animation / Motion Graphics", abbr: "MGFX", pipeline: "2D", pipelineOrder: 16, color: "#55efc4", icon: "Film" },
    { name: "Compositing", abbr: "COMP", pipeline: "2D", pipelineOrder: 17, color: "#6c5ce7", icon: "Layers" },
  ];

  const deptIds: Record<string, string> = {};
  for (const d of deptDefs) {
    const id = crypto.randomUUID();
    deptIds[d.name] = id;
    await db
      .insert(departmentsTable)
      .values({ id, tenantId, ...d })
      .onConflictDoNothing();
  }

  // capability sets reuse the app's existing 14-id catalogue
  // (artifacts/forge/src/store/permissions.ts CAPABILITY_IDS) — see this
  // plan's Global Constraints for why no new capability strings are added.
  const roles = [
    {
      name: "admin",
      email: "admin@acme.com",
      user: "Acme Admin",
      department: null as string | null,
      capabilities: [
        "create_tasks", "edit_tasks", "delete_tasks", "assign_tasks",
        "submit_reviews", "approve_reviews", "manage_members", "manage_roles",
        "view_financials", "edit_financials", "manage_pipeline",
        "manage_licenses", "manage_integrations", "broadcast_updates",
      ],
    },
    {
      name: "production_head",
      email: "head@acme.com",
      user: "Acme Production Head",
      department: null,
      capabilities: [
        "create_tasks", "edit_tasks", "delete_tasks", "assign_tasks",
        "submit_reviews", "approve_reviews", "view_financials",
        "edit_financials", "manage_pipeline", "broadcast_updates",
      ],
    },
    {
      name: "producer",
      email: "producer@acme.com",
      user: "Acme Producer (Animation)",
      department: "Animation",
      capabilities: [
        "create_tasks", "edit_tasks", "assign_tasks", "submit_reviews",
        "approve_reviews", "manage_pipeline", "broadcast_updates",
      ],
    },
    {
      name: "producer",
      email: "producer.comp@acme.com",
      user: "Acme Producer (Compositing)",
      department: "Compositing",
      capabilities: [
        "create_tasks", "edit_tasks", "assign_tasks", "submit_reviews",
        "approve_reviews", "manage_pipeline", "broadcast_updates",
      ],
    },
    {
      name: "lead",
      email: "lead@acme.com",
      user: "Acme Lead (Animation)",
      department: "Animation",
      capabilities: [
        "create_tasks", "edit_tasks", "assign_tasks", "submit_reviews",
        "approve_reviews",
      ],
    },
    {
      name: "lead",
      email: "lead.fx@acme.com",
      user: "Acme Lead (FX Simulations)",
      department: "FX Simulations",
      capabilities: [
        "create_tasks", "edit_tasks", "assign_tasks", "submit_reviews",
        "approve_reviews",
      ],
    },
    {
      name: "artist",
      email: "artist@acme.com",
      user: "Acme Artist (Animation)",
      department: "Animation",
      capabilities: ["edit_tasks", "submit_reviews"],
    },
    {
      name: "artist",
      email: "artist.comp@acme.com",
      user: "Acme Artist (Compositing)",
      department: "Compositing",
      capabilities: ["edit_tasks", "submit_reviews"],
    },
    {
      name: "artist",
      email: "artist.fx@acme.com",
      user: "Acme Artist (FX Simulations)",
      department: "FX Simulations",
      capabilities: ["edit_tasks", "submit_reviews"],
    },
    {
      name: "client",
      email: "client@acme.com",
      user: "Acme Client",
      department: null,
      capabilities: ["approve_reviews"],
    },
  ];

  const roleIdByName: Record<string, string> = {};
  for (const roleDef of roles) {
    // Multiple entries share the same role NAME (e.g. two "producer" rows,
    // one per department) but must resolve to the same tenant_roles row and
    // the same capability set — only insert/query the role once per name.
    if (!roleIdByName[roleDef.name]) {
      const roleId = crypto.randomUUID();
      await db
        .insert(tenantRolesTable)
        .values({ id: roleId, tenantId, name: roleDef.name, isSystemDefault: true })
        .onConflictDoNothing();

      // Scope by tenantId too, not just name: tenant_roles has no unique
      // constraint on (tenant_id, name), and an unscoped query here could
      // resolve to another tenant's "admin" row, silently binding this
      // tenant's users to a foreign tenant's capability set.
      const [insertedRole] = await db
        .select()
        .from(tenantRolesTable)
        .where(
          and(
            eq(tenantRolesTable.name, roleDef.name),
            eq(tenantRolesTable.tenantId, tenantId),
          ),
        );
      roleIdByName[roleDef.name] = insertedRole.id;

      for (const cap of roleDef.capabilities) {
        await db
          .insert(tenantRoleCapabilitiesTable)
          .values({ roleId: insertedRole.id, capabilityId: cap })
          .onConflictDoNothing();
      }
    }

    await db
      .insert(usersTable)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        roleId: roleIdByName[roleDef.name],
        departmentId: roleDef.department ? deptIds[roleDef.department] : null,
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
