import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * A calendar reminder instead of push notifications: nothing to subscribe to, and the
 * event title is neutral so a lock screen or shared calendar reveals nothing.
 */
export async function GET(req: NextRequest) {
  const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 14));
  const start = new Date(Date.now() + days * 86_400_000);
  start.setUTCHours(13, 30, 0, 0); // 7:00 PM IST
  const end = new Date(start.getTime() + 15 * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aatman//Reminder//EN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@aatman`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    "SUMMARY:Check-in",
    `URL:${new URL("/checkin", env().APP_URL).toString()}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="check-in.ics"',
    },
  });
}
