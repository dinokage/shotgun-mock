/**
 * One-off: creates a real artist-role test account in the Animation
 * department, and sets a known password on the existing lead.test /
 * production_head accounts so the whole submit -> lead -> PM chain can be
 * exercised end-to-end via curl. Passwords read from the environment, never
 * hardcoded -- same reasoning as promote-admin.ts / create-test-client.ts.
 *
 * Run once against the live database:
 *   TEST_ARTIST_PASSWORD='...' TEST_LEAD_PASSWORD='...' TEST_PM_PASSWORD='...' \
 *     pnpm run create-test-artist
 */
import * as argon2 from "argon2";
import * as crypto from "crypto";
import { prisma } from "./index";

const DEPARTMENT_NAME = "Animation";
const ARTIST_EMAIL = "test.artist@symbiosystech.com";
const ARTIST_NAME = "Test Artist";
const LEAD_EMAIL = "lead.test@symbiosystech.com";
const PM_EMAIL = "production@symtech.com";
const ANCHOR_EMAIL = "pipelinevizag@symbiosystech.com";

async function main() {
  const artistPassword = process.env.TEST_ARTIST_PASSWORD;
  const leadPassword = process.env.TEST_LEAD_PASSWORD;
  const pmPassword = process.env.TEST_PM_PASSWORD;
  if (!artistPassword || artistPassword.length < 6) {
    console.error("Set TEST_ARTIST_PASSWORD (>= 6 chars).");
    process.exit(1);
  }
  if (!leadPassword || leadPassword.length < 6) {
    console.error("Set TEST_LEAD_PASSWORD (>= 6 chars).");
    process.exit(1);
  }
  if (!pmPassword || pmPassword.length < 6) {
    console.error("Set TEST_PM_PASSWORD (>= 6 chars).");
    process.exit(1);
  }

  const anchor = await prisma.user.findFirst({
    where: { email: { equals: ANCHOR_EMAIL, mode: "insensitive" } },
  });
  if (!anchor) {
    console.error(`Anchor user ${ANCHOR_EMAIL} not found. Aborting.`);
    process.exit(1);
  }
  const tenantId = anchor.tenantId;

  const dept = await prisma.department.findFirst({
    where: { tenantId, name: DEPARTMENT_NAME },
  });
  if (!dept) {
    console.error(`Department "${DEPARTMENT_NAME}" not found. Aborting.`);
    process.exit(1);
  }

  const artistRole = await prisma.tenantRole.findFirst({
    where: { tenantId, name: "artist" },
  });
  if (!artistRole) {
    console.error('No "artist" role found. Aborting.');
    process.exit(1);
  }

  let artist = await prisma.user.findFirst({
    where: { email: { equals: ARTIST_EMAIL, mode: "insensitive" } },
  });
  if (artist) {
    artist = await prisma.user.update({
      where: { id: artist.id },
      data: {
        roleId: artistRole.id,
        departmentId: dept.id,
        hashedPassword: await argon2.hash(artistPassword),
        status: "active",
        tokenVersion: { increment: 1 },
      },
    });
    console.log(`Existing account ${ARTIST_EMAIL} updated.`);
  } else {
    artist = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        roleId: artistRole.id,
        departmentId: dept.id,
        email: ARTIST_EMAIL,
        name: ARTIST_NAME,
        hashedPassword: await argon2.hash(artistPassword),
        status: "active",
      },
    });
    console.log(`Created new account ${ARTIST_EMAIL}.`);
  }

  const lead = await prisma.user.findFirst({
    where: { email: { equals: LEAD_EMAIL, mode: "insensitive" } },
  });
  if (!lead) {
    console.error(
      `WARNING: ${LEAD_EMAIL} not found -- skipping its password reset.`,
    );
  } else {
    await prisma.user.update({
      where: { id: lead.id },
      data: {
        hashedPassword: await argon2.hash(leadPassword),
        tokenVersion: { increment: 1 },
      },
    });
    console.log(`${LEAD_EMAIL} password set from TEST_LEAD_PASSWORD.`);
  }

  const pm = await prisma.user.findFirst({
    where: { email: { equals: PM_EMAIL, mode: "insensitive" } },
  });
  if (!pm) {
    console.error(
      `WARNING: ${PM_EMAIL} not found -- skipping its password reset.`,
    );
  } else {
    await prisma.user.update({
      where: { id: pm.id },
      data: {
        hashedPassword: await argon2.hash(pmPassword),
        tokenVersion: { increment: 1 },
      },
    });
    console.log(`${PM_EMAIL} password set from TEST_PM_PASSWORD.`);
  }

  console.log("");
  console.log(`Artist test account ready: ${ARTIST_EMAIL} (Animation dept)`);
  console.log("All three passwords set from their respective env vars.");
  console.log("");
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
