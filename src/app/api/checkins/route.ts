import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { forbiddenOrigin, isSameOrigin, readJson } from "@/lib/http";
import { createCheckin } from "@/lib/services/checkins";
import { rateLimit } from "@/lib/services/rateLimit";
import { checkinBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"], { consent: true });
  if (auth.error) return auth.error;
  if (!(await rateLimit(`checkin:${auth.session.sub}`, 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await readJson(req, checkinBody);
  if (body.error) return body.error;

  const saved = await createCheckin(auth.session.sub, body.data);
  return NextResponse.json({ id: saved.id, createdAt: saved.createdAt, triage: saved.triage }, { status: 201 });
}
