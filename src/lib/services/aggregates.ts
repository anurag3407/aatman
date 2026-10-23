import "server-only";
import { and, gte, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Tier } from "@/lib/safety/triage";
import { TIERS } from "@/lib/safety/triage";

/**
 * Institute-level numbers only. Any count from 1 to K_MIN−1 is shown as "<10", and a
 * second cell is hidden when needed so the hidden one can't be worked out from the row total.
 */
export const K_MIN = 10;

export type Cell = number | "suppressed";

export function suppress(counts: number[]): Cell[] {
  const cells: Cell[] = counts.map((c) => (c > 0 && c < K_MIN ? "suppressed" : c));
  const hidden = cells.filter((c) => c === "suppressed").length;
  if (hidden === 1) {
    // Complementary suppression: hide the smallest remaining non-zero cell too.
    let idx = -1;
    cells.forEach((c, i) => {
      if (typeof c === "number" && c > 0 && (idx === -1 || c < (cells[idx] as number))) idx = i;
    });
    if (idx !== -1) cells[idx] = "suppressed";
  }
  return cells;
}

export function suppressTotal(n: number): Cell {
  return n > 0 && n < K_MIN ? "suppressed" : n;
}

export interface WeekRow {
  weekStart: string;
  total: Cell;
  students: Cell;
  byTier: Record<Tier, Cell>;
}

export async function weeklyTierCounts(weeks = 12, now = new Date()): Promise<WeekRow[]> {
  const db = await getDb();
  const since = new Date(now.getTime() - weeks * 7 * 86_400_000);
  const week = sql<string>`to_char(date_trunc('week', ${schema.checkins.createdAt}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      week,
      tier: schema.checkins.tier,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.checkins)
    .where(gte(schema.checkins.createdAt, since))
    .groupBy(week, schema.checkins.tier);

  const studentsPerWeek = await db
    .select({ week, students: sql<number>`count(distinct ${schema.checkins.pseudonym})::int` })
    .from(schema.checkins)
    .where(gte(schema.checkins.createdAt, since))
    .groupBy(week);

  const byWeek = new Map<string, Record<Tier, number>>();
  for (const r of rows) {
    const entry = byWeek.get(r.week) ?? (Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>);
    entry[r.tier] = r.n;
    byWeek.set(r.week, entry);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekStart, counts]) => {
      const values = TIERS.map((t) => counts[t]);
      const cells = suppress(values);
      const total = values.reduce((a, b) => a + b, 0);
      const students = studentsPerWeek.find((s) => s.week === weekStart)?.students ?? 0;
      return {
        weekStart,
        total: suppressTotal(total),
        students: suppressTotal(students),
        byTier: Object.fromEntries(TIERS.map((t, i) => [t, cells[i]])) as Record<Tier, Cell>,
      };
    });
}

export interface ServiceStats {
  slotsOffered: Cell;
  slotsBooked: Cell;
  contactRequests: Cell;
  /** Median hours from request to first contact, over requests that have been contacted. */
  medianHoursToContact: number | null;
}

export async function serviceStats(days = 28, now = new Date()): Promise<ServiceStats> {
  const db = await getDb();
  const since = new Date(now.getTime() - days * 86_400_000);

  const [slots] = await db
    .select({
      offered: sql<number>`count(*)::int`,
      booked: sql<number>`count(*) filter (where ${schema.slots.status} = 'booked')::int`,
    })
    .from(schema.slots)
    .where(and(gte(schema.slots.startsAt, since), sql`${schema.slots.startsAt} <= ${now}`));

  const [requests] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.contactRequests)
    .where(gte(schema.contactRequests.createdAt, since));

  const [median] = await db
    .select({
      hours: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${schema.contactRequests.contactedAt} - ${schema.contactRequests.createdAt})) / 3600)`,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.contactRequests)
    .where(and(gte(schema.contactRequests.createdAt, since), isNotNull(schema.contactRequests.contactedAt)));

  return {
    slotsOffered: slots.offered,
    slotsBooked: slots.booked,
    contactRequests: suppressTotal(requests.n),
    // A median over fewer than K_MIN requests could describe one person's experience.
    medianHoursToContact: median.n >= K_MIN && median.hours !== null ? Math.round(Number(median.hours) * 10) / 10 : null,
  };
}
