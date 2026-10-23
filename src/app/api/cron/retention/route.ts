import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runRetention } from "@/lib/services/retention";

/** Call daily from a scheduler: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" …/api/cron/retention`. */
export async function POST(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runRetention(env().RETENTION_MONTHS));
}
