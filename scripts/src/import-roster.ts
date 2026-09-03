// One-time real-data import: reads the company's actual roster spreadsheet
// and creates real login accounts directly (NOT via the email-invite flow --
// the sheet has no email addresses, and this script never sends any email or
// external communication). Synthesizes a corporate email under the real
// company domain for each person and assigns a single shared temporary
// password, which the admin is expected to hand out and have people change.
// Run once, locally (not in Docker), against the dev DB exposed on
// localhost:5432 -- the source .xlsx lives on the host filesystem.
import { db } from "@workspace/db";
import {
  usersTable,
  tenantRolesTable,
  departmentsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import * as argon2 from "argon2";
import * as crypto from "crypto";
import * as XLSX from "xlsx";

const TENANT_ID = process.env.IMPORT_TENANT_ID;
const ROSTER_PATH = process.env.ROSTER_PATH;
const TEMP_PASSWORD = process.env.IMPORT_TEMP_PASSWORD;
const EMAIL_DOMAIN = "symbiosystech.com";

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

// Matches components/admin/EmployeeImportDialog.tsx's guessRoleName --
// same heuristic, same "always default to least-privileged" contract.
function guessRoleName(designation: string): string {
  const d = designation.toLowerCase();
  if (d.includes("head")) return "production_head";
  if (d.includes("supervisor") || d.includes("lead")) return "lead";
  if (d.includes("producer") || d.includes("coordinator") || d.includes("manager"))
    return "producer";
  return "artist";
}

interface RosterRow {
  name: string;
  sourceDept: string;
  sourceDesignation: string;
}

function parseRoster(path: string): RosterRow[] {
  const wb = XLSX.readFile(path);
  const rows: RosterRow[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json<Record<string, any>>(
      wb.Sheets[sheetName],
      { header: 1, defval: "" },
    );
    for (const row of sheetRows as any[][]) {
      // Sheet1 shape: [Sno, Name, Dept, Designation] with a real header row.
      // Sheet3 shape: [FirstName, LastName, EmpID, Dept, Designation, Studio]
      // with NO header row at all.
      const cells = row.map((c) => String(c ?? "").trim());
      if (cells.every((c) => !c)) continue; // blank row
      if (
        cells[0].toLowerCase() === "sno" ||
        cells[1]?.toLowerCase().includes("name of the")
      )
        continue; // header row

      let name = "";
      let sourceDept = "";
      let sourceDesignation = "";
      if (cells.length <= 4 && /^\d+$/.test(cells[0])) {
        // Sheet1: Sno, Name, Dept, Designation
        name = cells[1];
        sourceDept = cells[2];
        sourceDesignation = cells[3];
      } else {
        // Sheet3: FirstName, LastName, EmpID, Dept, Designation, Studio
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

function slugifyEmail(name: string, usedEmails: Set<string>): string {
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
    console.error(
      "Set IMPORT_TENANT_ID, ROSTER_PATH, and IMPORT_TEMP_PASSWORD in the environment before running.",
    );
    process.exit(1);
  }

  const roles = await db
    .select({ id: tenantRolesTable.id, name: tenantRolesTable.name })
    .from(tenantRolesTable)
    .where(eq(tenantRolesTable.tenantId, TENANT_ID));
  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));

  const departments = await db
    .select({ id: departmentsTable.id, name: departmentsTable.name, abbr: departmentsTable.abbr })
    .from(departmentsTable)
    .where(eq(departmentsTable.tenantId, TENANT_ID));

  function guessDepartment(sourceDept: string) {
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

  const existingUsers = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.tenantId, TENANT_ID));
  const existingNames = new Set(existingUsers.map((u) => u.name.toLowerCase()));
  const usedEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  const rows = parseRoster(ROSTER_PATH);
  const hashedPassword = await hashPassword(TEMP_PASSWORD);

  let created = 0;
  let skipped = 0;
  const createdRows: { name: string; email: string; role: string; dept: string }[] = [];

  for (const row of rows) {
    if (existingNames.has(row.name.toLowerCase())) {
      skipped++;
      continue; // already a real user (e.g. the 3 already onboarded)
    }
    const roleName = guessRoleName(row.sourceDesignation);
    const roleId = roleIdByName.get(roleName);
    if (!roleId) {
      console.warn(`Skipping "${row.name}" -- no "${roleName}" role found for this tenant.`);
      skipped++;
      continue;
    }
    const dept = guessDepartment(row.sourceDept);
    const email = slugifyEmail(row.name, usedEmails);

    await db.insert(usersTable).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      roleId,
      departmentId: dept?.id ?? null,
      email,
      hashedPassword,
      name: row.name,
      title: row.sourceDesignation || null,
      status: "active",
    });
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
  process.exit(0);
}

main().catch((err) => {
  console.error("Roster import failed:", err);
  process.exit(1);
});
