// Syncs every tenant's role capabilities to the declared matrix, without the
// full destructive reset that reset-and-bootstrap-admin.ts performs.
//
// The matrix is imported from that script so there is one definition of the
// hierarchy rather than two that can drift.
//
// Usage: tsx ./src/sync-role-capabilities.ts [--dry]
import { prisma } from "@workspace/db";
import { ROLE_CAPABILITIES } from "./roleCapabilities";

const DRY_RUN = process.argv.includes("--dry");

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const roles = await prisma.tenantRole.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    });

    for (const role of roles) {
      const desired = ROLE_CAPABILITIES[role.name];
      if (!desired) {
        console.log(`${tenant.name}: ${role.name} — not in matrix, left alone`);
        continue;
      }
      const current = await prisma.tenantRoleCapability.findMany({
        where: { roleId: role.id },
        select: { capabilityId: true },
      });
      const currentSet = new Set(current.map((c) => c.capabilityId));
      const desiredSet = new Set(desired);

      const toAdd = desired.filter((c) => !currentSet.has(c));
      const toRemove = [...currentSet].filter((c) => !desiredSet.has(c));

      if (toAdd.length === 0 && toRemove.length === 0) {
        console.log(`${tenant.name}: ${role.name} — already in sync`);
        continue;
      }
      console.log(
        `${tenant.name}: ${role.name} — +[${toAdd.join(", ")}] -[${toRemove.join(", ")}]`,
      );
      if (DRY_RUN) continue;

      if (toRemove.length) {
        await prisma.tenantRoleCapability.deleteMany({
          where: { roleId: role.id, capabilityId: { in: toRemove } },
        });
      }
      if (toAdd.length) {
        await prisma.tenantRoleCapability.createMany({
          data: toAdd.map((capabilityId) => ({ roleId: role.id, capabilityId })),
        });
      }
    }
  }
  if (DRY_RUN) console.log("\n(dry run — nothing written)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
