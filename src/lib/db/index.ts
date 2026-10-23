import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export { schema };

/** Both drivers expose the same query builder; typed as node-postgres for simplicity. */
export type Db = NodePgDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as { aatmanDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = env().DATABASE_URL;

  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const location = url.slice("pglite:".length);
    let client;
    if (location === "memory") {
      client = new PGlite();
    } else {
      // PGlite creates its own directory but not missing parents (e.g. ./.data on a fresh clone).
      mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
      client = new PGlite(path.resolve(location));
    }
    const db = drizzle(client, { schema });
    // Local/test databases migrate themselves; production runs `pnpm db:migrate` on deploy.
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
  }

  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: url,
    max: env().DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    // Fail fast when Postgres is unreachable, so health checks take the instance out of rotation.
    connectionTimeoutMillis: 5_000,
  });
  return drizzle(pool, { schema });
}

export function getDb(): Promise<Db> {
  globalForDb.aatmanDb ??= connect().catch((err) => {
    globalForDb.aatmanDb = undefined;
    throw err;
  });
  return globalForDb.aatmanDb;
}
