/**
 * One-off: makes pipelinevizag@symbiosystech.com the sole admin, deactivates
 * the previous admin account rather than hard-deleting it (this schema has
 * a lot of createdById/actorUserId-style foreign keys pointing at users --
 * a hard delete either cascades into unrelated history or fails outright
 * depending on each one's onDelete rule; deactivation is the mechanism this
 * app already exposes for "this account no longer works" while keeping
 * everything it touched intact, same as Admin Panel's own Deactivate).
 *
 * The new password is read from the environment, never hardcoded here --
 * same reasoning as every other secret in this codebase (JWT_SECRET,
 * POSTGRES_PASSWORD, SMTP_PASSWORD): a literal in source is a literal in
 * git history the moment this file is committed, with no clean way to
 * scrub it back out later.
 *
 * Run once against the live database:
 *   NEW_ADMIN_PASSWORD='...' pnpm run promote-admin
 */
import * as argon2 from "argon2";
import { prisma } from "./index";

const NEW_ADMIN_EMAIL = "pipelinevizag@symbiosystech.com";
const OLD_ADMIN_EMAIL = "krishna.akshath11@gmail.com";

async function main() {
  const NEW_PASSWORD = process.env.NEW_ADMIN_PASSWORD;
  if (!NEW_PASSWORD || NEW_PASSWORD.length < 6) {
    console.error(
      "Set NEW_ADMIN_PASSWORD (at least 6 characters) in the environment before running this.",
    );
    process.exit(1);
  }

  const newAdminUser = await prisma.user.findFirst({
    where: { email: { equals: NEW_ADMIN_EMAIL, mode: "insensitive" } },
  });
  if (!newAdminUser) {
    console.error(`No user found with email ${NEW_ADMIN_EMAIL}. Aborting.`);
    process.exit(1);
  }

  const adminRole = await prisma.tenantRole.findFirst({
    where: { tenantId: newAdminUser.tenantId, name: "admin" },
  });
  if (!adminRole) {
    console.error(`No "admin" role found for tenant ${newAdminUser.tenantId}. Aborting.`);
    process.exit(1);
  }

  const oldAdminUser = await prisma.user.findFirst({
    where: { email: { equals: OLD_ADMIN_EMAIL, mode: "insensitive" } },
  });

  await prisma.user.update({
    where: { id: newAdminUser.id },
    data: {
      roleId: adminRole.id,
      hashedPassword: await argon2.hash(NEW_PASSWORD),
      status: "active",
      // Invalidates any session this account is currently holding -- without
      // this, a browser already signed in as pipelinevizag would keep using
      // its OLD role (production_head) until that session's JWT happened to
      // expire, since role is read from the token, not re-checked per
      // request the way tokenVersion/status are.
      tokenVersion: { increment: 1 },
    },
  });

  if (oldAdminUser) {
    await prisma.user.update({
      where: { id: oldAdminUser.id },
      data: { status: "inactive", tokenVersion: { increment: 1 } },
    });
  }

  console.log("");
  console.log(`${NEW_ADMIN_EMAIL} is now admin, with the password from NEW_ADMIN_PASSWORD.`);
  if (oldAdminUser) {
    console.log(
      `${OLD_ADMIN_EMAIL} has been deactivated (signed out everywhere, can't sign back in). ` +
        "Its history, tasks and audit trail are untouched -- reactivate it in Admin Panel if this was a mistake.",
    );
  } else {
    console.log(`${OLD_ADMIN_EMAIL} was not found -- nothing to deactivate.`);
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
