// Plain JS (no TypeScript/esbuild/tsx involved) so it can run directly on
// this Windows host, sidestepping the broken esbuild binary that blocks
// tsx/drizzle-kit here. Mirrors scripts/src/import-roster.ts's logic
// exactly, just using `pg` directly instead of the drizzle wrapper.
import pg from "pg";
import argon2 from "argon2";
import crypto from "crypto";
import XLSX from "xlsx";

const { Client } = pg;

const TENANT_ID = process.env.IMPORT_TENANT_ID;
const ROSTER_PATH = process.env.ROSTER_PATH;
const TEMP_PASSWORD = process.env.IMPORT_TEMP_PASSWORD;
const EMAIL_DOMAIN = "symbiosystech.com";

function guessRoleName(designation) {
  const d = designation.toLowerCase();
  if (d.includes("head")) return "production_head";
  if (d.includes("supervisor") || d.includes("lead")) return "lead";
  if (d.includes("producer") || d.includes("coordinator") || d.includes("manager"))
    return "producer";
  return "artist";
}

function parseRoster(path) {
  const wb = XLSX.readFile(path);
  const rows = [];
  for (const sheetName of wb.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
    });
    for (const row of sheetRows) {
      const cells = row.map((c) => String(c ?? "").trim());
      if (cells.every((c) => !c)) continue;
      if (
        cells[0].toLowerCase() === "sno" ||
        (cells[1] || "").toLowerCase().includes("name of the")
      )
        continue;

      let name = "";
      let sourceDept = "";
      let sourceDesignation = "";
      if (cells.length <= 4 && /^\d+$/.test(cells[0])) {
        name = cells[1];
        sourceDept = cells[2];
        sourceDesignation = cells[3];
      } else {
        name = `${cells[0]} ${cells[1]}`.trim();
        sourceDept = cells[3];
        sourceDesignation = cells[4];
      }
      if (!name) continue;
      rows.push({ name, sourceDept, sourceDesignation });
    }
  }
  return rows;
}

function slugifyEmail(name, usedEmails) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
  let email = `${base}@${EMAIL_DOMAIN}`;
  let n = 2;
  while (usedEmails.has(email)) {
    email = `${base}${n}@${EMAIL_DOMAIN}`;
    n++;
  }
  usedEmails.add(email);
  return email;
}

async function main() {
  if (!TENANT_ID || !ROSTER_PATH || !TEMP_PASSWORD) {
    console.error("Set IMPORT_TENANT_ID, ROSTER_PATH, IMPORT_TEMP_PASSWORD.");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const rolesRes = await client.query(
    'SELECT id, name FROM tenant_roles WHERE tenant_id = $1',
    [TENANT_ID],
  );
  const roleIdByName = new Map(rolesRes.rows.map((r) => [r.name, r.id]));

  const deptsRes = await client.query(
    'SELECT id, name, abbr FROM departments WHERE tenant_id = $1',
    [TENANT_ID],
  );
  const departments = deptsRes.rows;

  function guessDepartment(sourceDept) {
    const d = sourceDept.trim().toLowerCase();
    if (!d) return undefined;
    return (
      departments.find((dept) => dept.name.toLowerCase() === d) ||
      departments.find(
        (dept) => dept.name.toLowerCase().includes(d) || d.includes(dept.name.toLowerCase()),
      ) ||
      departments.find((dept) => dept.abbr.toLowerCase() === d)
    );
  }

  const existingRes = await client.query(
    'SELECT email, name FROM users WHERE tenant_id = $1',
    [TENANT_ID],
  );
  const existingNames = new Set(existingRes.rows.map((u) => u.name.toLowerCase()));
  const usedEmails = new Set(existingRes.rows.map((u) => u.email.toLowerCase()));

  const rows = parseRoster(ROSTER_PATH);
  const hashedPassword = await argon2.hash(TEMP_PASSWORD);

  let created = 0;
  let skipped = 0;
  const createdRows = [];

  for (const row of rows) {
    if (existingNames.has(row.name.toLowerCase())) {
      skipped++;
      continue;
    }
    const roleName = guessRoleName(row.sourceDesignation);
    const roleId = roleIdByName.get(roleName);
    if (!roleId) {
      console.warn(`Skipping "${row.name}" -- no "${roleName}" role found.`);
      skipped++;
      continue;
    }
    const dept = guessDepartment(row.sourceDept);
    const email = slugifyEmail(row.name, usedEmails);
    const id = crypto.randomUUID();

    await client.query(
      `INSERT INTO users (id, tenant_id, role_id, department_id, email, hashed_password, name, title, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      [id, TENANT_ID, roleId, dept?.id ?? null, email, hashedPassword, row.name, row.sourceDesignation || null],
    );
    existingNames.add(row.name.toLowerCase());
    created++;
    createdRows.push({ name: row.name, email, role: roleName, dept: dept?.name ?? "(none)" });
  }

  console.log(`Created ${created} real accounts, skipped ${skipped} (already existed or unmapped).`);
  console.log(`Shared temporary password: ${TEMP_PASSWORD}`);
  console.log("");
  for (const r of createdRows) {
    console.log(`${r.name.padEnd(28)} ${r.email.padEnd(38)} ${r.role.padEnd(16)} ${r.dept}`);
  }
  await client.end();
}

main().catch((err) => {
  console.error("Roster import failed:", err);
  process.exit(1);
});
