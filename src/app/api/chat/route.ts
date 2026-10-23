import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { forbiddenOrigin, isSameOrigin, readJson } from "@/lib/http";
import { reflect } from "@/lib/llm";
import { rateLimit } from "@/lib/services/rateLimit";
import { chatBody } from "@/lib/validation";

/** Stateless: the browser holds the conversation, and nothing here is stored or logged. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"], { consent: true });
  if (auth.error) return auth.error;
  const body = await readJson(req, chatBody);
  if (body.error) return body.error;

  if (!rateLimit(`chat:${auth.session.sub}`, 40, 60 * 60 * 1000)) {
    return NextResponse.json({ type: "limit" }, { status: 429 });
  }
  return NextResponse.json(await reflect(body.data.messages, body.data.locale));
}
