// Applies SQL migrations in ./drizzle to DATABASE_URL (Postgres). Run on every deploy, before the new version starts.
// Usage: DATABASE_URL=postgres://… node scripts/migrate.mjs
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url || url.startsWith("pglite:")) {
  console.error("DATABASE_URL must be a postgres:// URL (pglite databases migrate themselves on start).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
