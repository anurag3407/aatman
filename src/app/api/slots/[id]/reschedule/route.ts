import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { forbiddenOrigin, isSameOrigin, readJson } from "@/lib/http";
import { rescheduleBooking } from "@/lib/services/booking";
import { isUuid } from "@/lib/services/checkins";
import { rescheduleBody } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"], { consent: true });
  if (auth.error) return auth.error;
  const body = await readJson(req, rescheduleBody);
  if (body.error) return body.error;

  const { id } = await params;
  if (!isUuid(id) || !isUuid(body.data.newSlotId)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await rescheduleBooking(auth.session.sub, id, body.data.newSlotId);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "not_eligible" ? 403 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
