import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { forbiddenOrigin, isSameOrigin, readJson } from "@/lib/http";
import { setKeep } from "@/lib/services/checkins";
import { keepBody } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"]);
  if (auth.error) return auth.error;
  const body = await readJson(req, keepBody);
  if (body.error) return body.error;

  const { id } = await params;
  const ok = await setKeep(auth.session.sub, id, body.data.keep);
  return ok ? NextResponse.json({ keep: body.data.keep }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
