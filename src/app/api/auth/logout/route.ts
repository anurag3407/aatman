import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { forbiddenOrigin, isSameOrigin, redirectTo } from "@/lib/http";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const res = redirectTo("/");
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
