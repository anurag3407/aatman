import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { forbiddenOrigin, isSameOrigin, readJson } from "@/lib/http";
import { createContactRequest } from "@/lib/services/contactRequests";
import { contactBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"], { consent: true });
  if (auth.error) return auth.error;
  const body = await readJson(req, contactBody);
  if (body.error) return body.error;

  const { checkinId, name, phone, email, bestTime } = body.data;
  const result = await createContactRequest(
    auth.session.sub,
    {
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(bestTime ? { bestTime } : {}),
    },
    checkinId,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "too_many" ? 429 : 400 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
