import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

async function main() {
  console.log('Running migrations...');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1, // Use a single connection for migrations
  });
  const db = drizzle(pool);
  
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
