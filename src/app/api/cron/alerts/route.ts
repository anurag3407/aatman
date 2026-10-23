import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { processOutbox, runAlertEscalation } from "@/lib/services/alerts";
import { runAppointmentReminders } from "@/lib/services/reminders";

/** Run every minute: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" …/api/cron/alerts`. */
export async function POST(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const escalated = await runAlertEscalation();
  const delivery = await processOutbox();
  const reminders = await runAppointmentReminders();
  return NextResponse.json({ escalated, ...delivery, reminders });
}
