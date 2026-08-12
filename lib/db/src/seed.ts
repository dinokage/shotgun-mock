import bcrypt from "bcryptjs";
import { db, pool, studiosTable, usersTable } from "./index";

// Demo accounts, one per role. Names match real entries in
// artifacts/forge/src/data/mockData.ts's USERS array so the frontend can
// enrich the authenticated identity with that mock profile's display
// fields (avatar, title, department, skills) until Phase 1 makes Users a
// fully real entity. See lib/db/src/seed.ts and
// artifacts/forge/src/data/demoAccounts.ts — keep both lists in sync.
const DEMO_PASSWORD = "forge123";

const DEMO_USERS = [
  { empId: "DEMO-PRODUCER", email: "maya@nebula.co", name: "Maya Chen", role: "vfx_producer" },
  { empId: "DEMO-PM", email: "ethan@nebula.co", name: "Ethan Brooks", role: "production_manager" },
  { empId: "DEMO-COORD", email: "kofi@nebula.co", name: "Kofi Mensah", role: "coordinator" },
  { empId: "DEMO-SUPERVISOR", email: "luca@nebula.co", name: "Luca Moretti", role: "supervisor" },
  { empId: "DEMO-LEAD", email: "isla@nebula.co", name: "Isla MacLeod", role: "lead" },
  { empId: "DEMO-SENIOR", email: "mia@nebula.co", name: "Mia Rodriguez", role: "senior_artist" },
  { empId: "DEMO-ARTIST", email: "jin@nebula.co", name: "Jin Park", role: "artist" },
  { empId: "DEMO-JUNIOR", email: "clara@nebula.co", name: "Clara Werner", role: "junior_artist" },
  { empId: "DEMO-CLIENT", email: "client@nebula.co", name: "External Client", role: "client" },
] as const;

async function seed() {
  const [studio] = await db
    .insert(studiosTable)
    .values({ name: "Nebula VFX", slug: "nebula" })
    .onConflictDoUpdate({
      target: studiosTable.slug,
      set: { name: "Nebula VFX" },
    })
    .returning();

  if (!studio) {
    throw new Error("Failed to create or find the seed studio");
  }

  for (const user of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    await db
      .insert(usersTable)
      .values({
        studioId: studio.id,
        empId: user.empId,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
      })
      .onConflictDoUpdate({
        target: usersTable.empId,
        set: {
          email: user.email,
          name: user.name,
          role: user.role,
          passwordHash,
          studioId: studio.id,
        },
      });
  }

  console.log(
    `Seeded studio "${studio.name}" with ${DEMO_USERS.length} demo users (password: ${DEMO_PASSWORD})`,
  );
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
