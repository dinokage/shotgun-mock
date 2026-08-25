const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function seed() {
  await client.connect();

  try {
    // Insert Studio
    await client.query(`
      INSERT INTO studios (id, name, region)
      VALUES ('studio-1', 'Nebula Studios', 'NA')
      ON CONFLICT (id) DO NOTHING
    `);

    const users = [
      {
        id: "user-0",
        empId: "EMP-000",
        name: "Admin",
        role: "admin",
        title: "System Admin",
        email: "admin@nebula.co",
      },
      {
        id: "user-1",
        empId: "EMP-001",
        name: "Maya Chen",
        role: "vfx_producer",
        title: "VFX Producer",
        email: "maya@nebula.co",
      },
      {
        id: "user-2",
        empId: "EMP-002",
        name: "Sarah Jenkins",
        role: "department_manager",
        title: "Lighting Manager",
        email: "sarah@nebula.co",
      },
      {
        id: "user-3",
        empId: "EMP-003",
        name: "David Kim",
        role: "lead_artist",
        title: "Comp Lead",
        email: "david@nebula.co",
      },
      {
        id: "user-4",
        empId: "EMP-004",
        name: "Liam Wright",
        role: "artist",
        title: "Senior Compositor",
        email: "liam@nebula.co",
      },
      {
        id: "user-5",
        empId: "EMP-005",
        name: "Client Reviewer",
        role: "client",
        title: "Client",
        email: "client@nebula.co",
      },
    ];

    for (const u of users) {
      await client.query(
        `
        INSERT INTO users (id, "empId", name, role, title, email, "studioId", password)
        VALUES ($1, $2, $3, $4, $5, $6, 'studio-1', 'forge123')
        ON CONFLICT (id) DO NOTHING
      `,
        [u.id, u.empId, u.name, u.role, u.title, u.email],
      );
    }

    console.log("Seeded all mock users for portals!");
  } catch (err) {
    console.error("Error seeding data:", err);
  } finally {
    await client.end();
  }
}
seed();
