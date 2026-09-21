/** One-off: reactivate two test accounts found deactivated mid-QA-pass. */
import { prisma } from "./index";

const EMAILS = ["lead.test@symbiosystech.com", "production@symtech.com"];

async function main() {
  for (const email of EMAILS) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (!user) {
      console.log(`${email}: not found`);
      continue;
    }
    console.log(`${email}: was status="${user.status}"`);
    await prisma.user.update({
      where: { id: user.id },
      data: { status: "active" },
    });
    console.log(`${email}: reactivated`);
  }
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
