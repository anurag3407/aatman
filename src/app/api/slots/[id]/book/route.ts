import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { forbiddenOrigin, isSameOrigin, readJson } from "@/lib/http";
import { bookSlot } from "@/lib/services/booking";
import { isUuid } from "@/lib/services/checkins";
import { bookBody } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"], { consent: true });
  if (auth.error) return auth.error;
  const body = await readJson(req, bookBody);
  if (body.error) return body.error;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await bookSlot(auth.session.sub, id, {
    shareLatestCheckin: body.data.share,
    phone: body.data.phone || undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
