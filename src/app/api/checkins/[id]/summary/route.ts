import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { forbiddenOrigin, isSameOrigin } from "@/lib/http";
import { summarize } from "@/lib/llm";
import { getCheckin, saveSummary } from "@/lib/services/checkins";
import { rateLimit } from "@/lib/services/rateLimit";

/** Generates the note once and caches it encrypted on the check-in. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"], { consent: true });
  if (auth.error) return auth.error;

  const { id } = await params;
  const checkin = await getCheckin(auth.session.sub, id);
  if (!checkin) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (checkin.summary) return NextResponse.json(checkin.summary);

  if (!(await rateLimit(`summary:${auth.session.sub}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const summary = await summarize(checkin.triage, checkin.campus, checkin.locale);
  await saveSummary(auth.session.sub, id, summary);
  return NextResponse.json(summary);
}
