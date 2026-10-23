import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { forbiddenOrigin, isSameOrigin } from "@/lib/http";
import { eraseStudent } from "@/lib/services/studentData";

/** Right to erasure: deletes everything and signs out. */
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"]);
  if (auth.error) return auth.error;
  await eraseStudent(auth.session.sub);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
