// Deactivates every account except the one main admin, without deleting any
// row -- the roster, their 1066 assigned tasks, and every other real record
// referencing them stays intact. Deactivated accounts can be reactivated
// individually later (PATCH /api/users/:id { status: "active" }), or the
// person can simply be replaced by a fresh self-registered account.
//
// Also bumps tokenVersion for everyone deactivated, so anyone with an
// existing session is signed out immediately rather than whenever their
// token's 7-day life or the 5-minute status cache happens to expire.
import { prisma } from "@workspace/db";

const KEEP_ACTIVE_ID = "fe3f783b-c1f3-482e-a60c-42a26e5404a7"; // Krishna Akshath, main admin
const DRY_RUN = process.argv.includes("--dry");

async function main() {
  const targets = await prisma.user.findMany({
    where: { id: { not: KEEP_ACTIVE_ID }, deletedAt: null, status: "active" },
    select: { id: true, name: true, email: true, role: { select: { name: true } } },
  });

  console.log(`${targets.length} accounts to deactivate (all except the main admin):`);
  const byRole = new Map<string, number>();
  for (const t of targets) {
    const r = t.role.name;
    byRole.set(r, (byRole.get(r) ?? 0) + 1);
  }
  for (const [role, count] of [...byRole].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${role}: ${count}`);
  }

  if (DRY_RUN) {
    console.log("(dry run -- nothing written)");
    return;
  }

  const result = await prisma.user.updateMany({
    where: { id: { not: KEEP_ACTIVE_ID }, deletedAt: null },
    data: { status: "inactive", tokenVersion: { increment: 1 } },
  });
  console.log(`deactivated ${result.count} accounts`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
