// One-time real-data import: mirrors
// artifacts/forge/src/components/tracking/TracksheetImportDialog.tsx's
// exact row-by-row logic (episode/sequence/shot dedup keys, field mapping,
// status/artist/date extraction, extraNotes construction), but writes
// directly to the database instead of driving the browser UI -- the real
// tracksheet is 11MB (over the browser-upload bridge's 10MB cap) and would
// mean 5000+ sequential authenticated HTTP round trips from a browser tab.
import fs from "fs";
import pg from "pg";
import XLSX from "xlsx";
import crypto from "crypto";

const { Client } = pg;

const TENANT_ID = process.env.IMPORT_TENANT_ID;
const PROJECT_ID = process.env.IMPORT_PROJECT_ID;
const TRACKSHEET_PATH = process.env.TRACKSHEET_PATH;

const MAX_IMPORT_ROWS = 5000;
const EPISODE_SHEET_PATTERN = /ep\s*0*(\d+)/i;

function sheetToRows(sheet) {
  const declaredRef = sheet["!ref"];
  let range;
  if (declaredRef) {
    const decoded = XLSX.utils.decode_range(declaredRef);
    if (decoded.e.r > MAX_IMPORT_ROWS) {
      range = XLSX.utils.encode_range({ s: decoded.s, e: { r: MAX_IMPORT_ROWS, c: decoded.e.c } });
    }
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, ...(range ? { range } : {}) });
  return rows.filter((row) => Object.values(row).some((v) => v !== ""));
}

function getField(row, candidates) {
  const normalizedKeys = Object.keys(row).map((k) => ({
    key: k,
    norm: k.trim().toLowerCase().replace(/[\s_-]+/g, ""),
  }));
  for (const candidate of candidates) {
    const normCandidate = candidate.toLowerCase().replace(/[\s_-]+/g, "");
    const match = normalizedKeys.find((k) => k.norm === normCandidate);
    if (match) return String(row[match.key] ?? "").trim();
  }
  return "";
}

function parseLooseDate(raw) {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{8}$/.test(value)) {
    const day = Number(value.slice(0, 2));
    const month = Number(value.slice(2, 4));
    const year = Number(value.slice(4, 8));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

const CONSUMED_KEYS = new Set(
  ["SC#", "SHOT_CODE", "Shot Code", "SEQ#", "Sequence", "FR", "Frames",
   "Frame Range", "Sec", "Duration", "Anim_status", "Layout_status",
   "Status", "Artist Name", "Artist", "Start Date", "End Date", "SL#"]
    .map((c) => c.toLowerCase().replace(/[\s_-]+/g, "")),
);

async function main() {
  if (!TENANT_ID || !PROJECT_ID || !TRACKSHEET_PATH) {
    console.error("Set IMPORT_TENANT_ID, IMPORT_PROJECT_ID, TRACKSHEET_PATH.");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const usersRes = await client.query(
    `SELECT u.id, u.name, r.name as role FROM users u JOIN tenant_roles r ON r.id = u.role_id WHERE u.tenant_id = $1`,
    [TENANT_ID],
  );
  const artists = usersRes.rows.filter((u) => u.role === "artist");

  const episodesRes = await client.query(
    `SELECT id, name FROM episodes WHERE tenant_id = $1 AND project_id = $2`,
    [TENANT_ID, PROJECT_ID],
  );
  const episodeCache = new Map(episodesRes.rows.map((e) => [e.name.toLowerCase(), e.id]));

  const sequencesRes = await client.query(
    `SELECT id, name, episode_id FROM sequences WHERE tenant_id = $1 AND project_id = $2`,
    [TENANT_ID, PROJECT_ID],
  );
  const sequenceCache = new Map(
    sequencesRes.rows.map((s) => [`${s.episode_id ?? ""}::${s.name.toLowerCase()}`, s.id]),
  );

  const shotsRes = await client.query(
    `SELECT id, name FROM shots WHERE tenant_id = $1 AND project_id = $2`,
    [TENANT_ID, PROJECT_ID],
  );
  const shotCache = new Map(shotsRes.rows.map((s) => [s.name.toLowerCase(), s.id]));

  const wb = XLSX.readFile(TRACKSHEET_PATH);
  const outcomes = [];
  let assignedCount = 0;

  for (const sheetName of wb.SheetNames) {
    const episodeMatch = sheetName.match(EPISODE_SHEET_PATTERN);
    if (!episodeMatch) continue;
    const episodeName = `Ep${episodeMatch[1].padStart(3, "0")}`;

    let episodeId = episodeCache.get(episodeName.toLowerCase());
    if (!episodeId) {
      episodeId = crypto.randomUUID();
      await client.query(
        `INSERT INTO episodes (id, tenant_id, project_id, name) VALUES ($1,$2,$3,$4)`,
        [episodeId, TENANT_ID, PROJECT_ID, episodeName],
      );
      episodeCache.set(episodeName.toLowerCase(), episodeId);
    }

    const rows = sheetToRows(wb.Sheets[sheetName]);
    for (const row of rows) {
      const shotCode = getField(row, ["SC#", "SHOT_CODE", "Shot Code"]);
      if (!shotCode) continue;
      const seqName = getField(row, ["SEQ#", "Sequence"]) || "Unassigned";

      let sequenceId = sequenceCache.get(`${episodeId}::${seqName.toLowerCase()}`);
      if (!sequenceId) {
        sequenceId = crypto.randomUUID();
        await client.query(
          `INSERT INTO sequences (id, tenant_id, project_id, episode_id, name) VALUES ($1,$2,$3,$4,$5)`,
          [sequenceId, TENANT_ID, PROJECT_ID, episodeId, seqName],
        );
        sequenceCache.set(`${episodeId}::${seqName.toLowerCase()}`, sequenceId);
      }

      let shotId = shotCache.get(shotCode.toLowerCase());
      let shotCreated = false;
      if (!shotId) {
        shotId = crypto.randomUUID();
        await client.query(
          `INSERT INTO shots (id, tenant_id, project_id, episode_id, sequence_id, name) VALUES ($1,$2,$3,$4,$5,$6)`,
          [shotId, TENANT_ID, PROJECT_ID, episodeId, sequenceId, shotCode],
        );
        shotCache.set(shotCode.toLowerCase(), shotId);
        shotCreated = true;
      }

      const frameRange = getField(row, ["FR", "Frames", "Frame Range"]);
      const durationRaw = getField(row, ["Sec", "Duration"]);
      const duration = Math.round(parseFloat(durationRaw)) || undefined;
      if (frameRange || duration) {
        const sets = [];
        const vals = [];
        if (frameRange) { sets.push(`frame_range = $${sets.length + 1}`); vals.push(frameRange); }
        if (duration) { sets.push(`duration = $${sets.length + 1}`); vals.push(duration); }
        sets.push(`updated_at = now()`);
        vals.push(shotId, TENANT_ID);
        await client.query(
          `UPDATE shots SET ${sets.join(", ")} WHERE id = $${vals.length - 1} AND tenant_id = $${vals.length}`,
          vals,
        );
      }

      const status = getField(row, ["Anim_status", "Layout_status", "Status"]) || "ready";
      const artistName = getField(row, ["Artist Name", "Artist"]);
      const assignee = artistName
        ? artists.find((u) => u.name.toLowerCase().includes(artistName.toLowerCase()))
        : undefined;
      if (assignee) assignedCount++;

      const startDate = parseLooseDate(getField(row, ["Start Date"]));
      const endDate = parseLooseDate(getField(row, ["End Date"]));

      const extraNotes = Object.entries(row)
        .filter(([k, v]) => v && !CONSUMED_KEYS.has(k.toLowerCase().replace(/[\s_-]+/g, "")))
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");

      const taskId = crypto.randomUUID();
      await client.query(
        `INSERT INTO tasks (id, tenant_id, entity_id, entity_type, title, description, status, priority, pipeline_phase, start_date, due_date, estimated_hours, assigned_to)
         VALUES ($1,$2,$3,'shot',$4,$5,$6,'medium','ANIM',$7,$8,$9,$10)`,
        [
          taskId, TENANT_ID, shotId,
          `Animation — ${shotCode}`,
          extraNotes || `Imported from ${sheetName}.`,
          status,
          startDate, endDate,
          duration ? Math.max(duration / 3600, 1) : 8,
          assignee?.id ?? null,
        ],
      );
      outcomes.push({ sheet: sheetName, shotCode, shotCreated });
    }
    console.log(`${sheetName}: processed ${rows.length} rows`);
  }

  console.log(`\nTotal rows imported: ${outcomes.length}`);
  console.log(`Shots created: ${outcomes.filter((o) => o.shotCreated).length}`);
  console.log(`Tasks created: ${outcomes.length}`);
  console.log(`Rows with a matched artist assignee: ${assignedCount} / ${outcomes.length}`);
  await client.end();
}

main().catch((err) => {
  console.error("Tracksheet import failed:", err);
  process.exit(1);
});
