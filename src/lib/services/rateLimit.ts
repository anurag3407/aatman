import "server-only";
import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Fixed-window rate limiter stored in Postgres, so the limit holds across every app
 * instance. One atomic upsert per call: it starts a new window when the old one has
 * expired, otherwise increments the counter. Stops runaway LLM spend from one account.
 */
export async function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const db = await getDb();
  const t = schema.rateLimits;
  const expired = sql`${t.windowStart} <= ${now - windowMs}`;
  const [row] = await db
    .insert(t)
    .values({ key: hashKey(key), windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        windowStart: sql`case when ${expired} then ${now} else ${t.windowStart} end`,
        count: sql`case when ${expired} then 1 else ${t.count} + 1 end`,
      },
    })
    .returning({ count: t.count });
  return row.count <= limit;
}

/** Deletes counters whose window ended more than `maxWindowMs` ago. Called by the retention job. */
export async function sweepRateLimits(maxWindowMs: number, now = Date.now()): Promise<number> {
  const db = await getDb();
  const rows = await db
    .delete(schema.rateLimits)
    .where(lt(schema.rateLimits.windowStart, now - maxWindowMs))
    .returning({ key: schema.rateLimits.key });
  return rows.length;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("base64url");
}
