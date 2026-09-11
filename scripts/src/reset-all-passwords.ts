// Resets every active account to one shared temporary password and writes a
// roster CSV so the build can be handed to testers.
//
// Existing passwords are argon2 hashes and cannot be read back, so producing
// a shareable credential list necessarily means replacing them. Run
// deliberately, never as part of a normal deploy.
//
// Usage:
//   RESET_PASSWORD='...' OUT_PATH='...' tsx ./src/reset-all-passwords.ts
//   add --dry to preview without writing.
import { prisma } from "@workspace/db";
import * as argon2 from "argon2";
import * as fs from "fs";

const DRY_RUN = process.argv.includes("--dry");
const PASSWORD = process.env.RESET_PASSWORD;
const OUT_PATH = process.env.OUT_PATH;

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function main() {
  if (!PASSWORD) throw new Error("RESET_PASSWORD is required");
  if (PASSWORD.length < 8) throw new Error("RESET_PASSWORD must be at least 8 characters");
  if (!OUT_PATH) throw new Error("OUT_PATH is required");

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      status: true,
      role: { select: { name: true } },
      department: { select: { name: true } },
      tenant: { select: { name: true } },
    },
    orderBy: [{ role: { name: "asc" } }, { name: "asc" }],
  });

  // One hash reused for every account: argon2 salts each call, so hashing 65
  // times would burn ~30s of CPU to produce 65 different hashes of the same
  // secret, which buys nothing when the secret is shared by design anyway.
  const hashed = await argon2.hash(PASSWORD);

  const rows = [
    ["Name", "Email", "Role", "Department", "Title", "Status", "Password"].join(","),
    ...users.map((u) =>
      [
        u.name,
        u.email,
        u.role?.name ?? "",
        u.department?.name ?? "",
        u.title ?? "",
        u.status ?? "",
        PASSWORD,
      ]
        .map((v) => csvCell(String(v)))
        .join(","),
    ),
  ].join("\n");

  const byRole = new Map<string, number>();
  for (const u of users) {
    const r = u.role?.name ?? "(none)";
    byRole.set(r, (byRole.get(r) ?? 0) + 1);
  }
  console.log(`${users.length} active accounts:`);
  for (const [role, count] of [...byRole].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${role}: ${count}`);
  }

  if (DRY_RUN) {
    console.log("(dry run — no passwords changed, no file written)");
    return;
  }

  const result = await prisma.user.updateMany({
    where: { deletedAt: null },
    data: { hashedPassword: hashed },
  });
  fs.writeFileSync(OUT_PATH, rows, "utf8");
  console.log(`reset ${result.count} passwords`);
  console.log(`wrote ${OUT_PATH}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
