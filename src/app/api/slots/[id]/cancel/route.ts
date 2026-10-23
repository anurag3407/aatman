import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { forbiddenOrigin, isSameOrigin } from "@/lib/http";
import { cancelBooking } from "@/lib/services/booking";
import { isUuid } from "@/lib/services/checkins";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  const ok = isUuid(id) && (await cancelBooking(auth.session.sub, id));
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
