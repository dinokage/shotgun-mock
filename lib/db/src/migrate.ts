import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

/**
 * Postgres SQLSTATE codes that all mean the exact same thing: "the object this
 * statement wanted to create is already there."
 *
 * These are the only failures we tolerate, and only because of a very specific
 * situation: if `lib/db/drizzle/` has not been committed to git, the API
 * server's Dockerfile regenerates migrations on every image build, giving each
 * one a fresh `folderMillis` timestamp. `drizzle-orm`'s migrator decides what
 * to re-apply by comparing that timestamp against the newest row in
 * `drizzle.__drizzle_migrations` — it never compares SQL content — so a
 * regenerated-but-identical migration always looks "not yet applied" and gets
 * replayed against an already-migrated database. The replay dies on the first
 * `CREATE TABLE`, `migrate()` throws, and (before this guard) the process
 * exited non-zero, which short-circuited the `&&` in docker-compose's `api`
 * command so the server never started — and `restart: unless-stopped` then
 * crash-looped it forever.
 *
 * Anything NOT in this list — bad SQL (42601), missing column (42703),
 * insufficient privilege (42501), constraint violations (23xxx), connection
 * failures (which carry no SQLSTATE at all) — still fails loudly, exactly as
 * before.
 *
 * THIS IS NOT A SUBSTITUTE FOR COMMITTING MIGRATIONS. See forge-final.md §5
 * step 3: generate `lib/db/drizzle/` once and commit it. Without that, this
 * guard cannot tell "already applied, safe to skip" apart from "a genuinely new
 * schema change needs applying", so it will silently skip real migrations.
 */
const ALREADY_EXISTS_SQLSTATES = new Set([
  "42P07", // duplicate_table   — CREATE TABLE / CREATE INDEX on an existing relation
  "42710", // duplicate_object  — ADD CONSTRAINT / CREATE TYPE that already exists
  "42701", // duplicate_column  — ADD COLUMN that already exists
]);

/**
 * `pg` throws a `DatabaseError` carrying the SQLSTATE on `.code`, and
 * drizzle-orm's node-postgres driver lets it propagate unwrapped. Newer
 * drizzle versions may wrap it in a `DrizzleQueryError`, so walk the `cause`
 * chain rather than only inspecting the top-level error.
 */
function isAlreadyExistsError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < 10; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && ALREADY_EXISTS_SQLSTATES.has(code)) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

async function main() {
  console.log("Running migrations...");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1, // Use a single connection for migrations
  });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } catch (err) {
    if (!isAlreadyExistsError(err)) throw err;

    console.warn(
      "Migration reported that a schema object already exists " +
        `(Postgres ${(err as { code?: string }).code ?? "already-exists"} error). ` +
        "The database already has this schema, so migration is being skipped " +
        "instead of failing the container start.",
    );
    console.warn(
      "This almost always means lib/db/drizzle/ is NOT committed to git, so " +
        "each image build regenerates migrations with a new timestamp and the " +
        "migrator tries to replay them. Generate and commit migrations once " +
        "(see forge-final.md §5 step 3) — until you do, genuinely new schema " +
        "changes will be silently skipped here too.",
    );
    console.warn("Original error:", err);
    console.log("Migrations skipped (schema already present).");
    process.exit(0);
  }

  console.log("Migrations complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
