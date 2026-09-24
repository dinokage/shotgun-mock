/**
 * One-off: creates a real, signed-in client-role test account and grants it
 * access to the PES Animation project, so a real person can log in and see
 * exactly what a client sees (client-review.tsx's isExplicitClient path,
 * scoped via ClientProjectAccess -- built this session, never actually
 * exercised by a real account since none existed).
 *
 * The password is read from the environment, never hardcoded -- same
 * reasoning as promote-admin.ts.
 *
 * Run once against the live database:
 *   TEST_CLIENT_PASSWORD='...' pnpm run create-test-client
 */
import * as argon2 from "argon2";
import * as crypto from "crypto";
import { prisma } from "./index";

const PROJECT_NAME = "PES Animation";
const CLIENT_EMAIL = "test.client@symbiosystech.com";
const CLIENT_NAME = "Test Client";
const GRANTED_BY_EMAIL = "pipelinevizag@symbiosystech.com";

async function main() {
  const password = process.env.TEST_CLIENT_PASSWORD;
  if (!password || password.length < 6) {
    console.error(
      "Set TEST_CLIENT_PASSWORD (at least 6 characters) in the environment before running this.",
    );
    process.exit(1);
  }

  const grantedBy = await prisma.user.findFirst({
    where: { email: { equals: GRANTED_BY_EMAIL, mode: "insensitive" } },
  });
  if (!grantedBy) {
    console.error(`Granting user ${GRANTED_BY_EMAIL} not found. Aborting.`);
    process.exit(1);
  }

  const project = await prisma.project.findFirst({
    where: { tenantId: grantedBy.tenantId, name: PROJECT_NAME },
  });
  if (!project) {
    console.error(
      `Project "${PROJECT_NAME}" not found in this tenant. Aborting.`,
    );
    process.exit(1);
  }

  const clientRole = await prisma.tenantRole.findFirst({
    where: { tenantId: grantedBy.tenantId, name: "client" },
  });
  if (!clientRole) {
    console.error('No "client" role found for this tenant. Aborting.');
    process.exit(1);
  }

  let clientUser = await prisma.user.findFirst({
    where: { email: { equals: CLIENT_EMAIL, mode: "insensitive" } },
  });

  if (clientUser) {
    clientUser = await prisma.user.update({
      where: { id: clientUser.id },
      data: {
        hashedPassword: await argon2.hash(password),
        status: "active",
        roleId: clientRole.id,
        tokenVersion: { increment: 1 },
      },
    });
    console.log(
      `Existing account ${CLIENT_EMAIL} updated with a fresh password.`,
    );
  } else {
    clientUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: grantedBy.tenantId,
        roleId: clientRole.id,
        email: CLIENT_EMAIL,
        name: CLIENT_NAME,
        hashedPassword: await argon2.hash(password),
        status: "active",
      },
    });
    console.log(`Created new account ${CLIENT_EMAIL}.`);
  }

  await prisma.clientProjectAccess.upsert({
    where: {
      userId_projectId: { userId: clientUser.id, projectId: project.id },
    },
    update: {},
    create: {
      id: crypto.randomUUID(),
      tenantId: grantedBy.tenantId,
      userId: clientUser.id,
      projectId: project.id,
      grantedByUserId: grantedBy.id,
    },
  });

  console.log("");
  console.log(`Client test account ready: ${CLIENT_EMAIL}`);
  console.log(`Granted access to: ${PROJECT_NAME}`);
  console.log("Password set from TEST_CLIENT_PASSWORD.");
  console.log(
    "Log in normally, then go to /client-review -- signed-in clients bypass the access code.",
  );
  console.log("");
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
