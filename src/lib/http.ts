import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { env } from "@/lib/env";

/**
 * CSRF defence for cookie-authenticated mutations. Sessions are SameSite=Lax, and
 * every mutating route also requires a same-origin `Origin` header (or
 * Sec-Fetch-Site: same-origin), which cross-site forms and scripts can't fake.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = req.headers.get("origin");
  return origin !== null && origin === new URL(env().APP_URL).origin;
}

export function forbiddenOrigin() {
  return NextResponse.json({ error: "bad_origin" }, { status: 403 });
}

export async function readJson<T extends z.ZodType>(
  req: NextRequest,
  schema: T,
): Promise<{ data: z.infer<T>; error?: never } | { data?: never; error: NextResponse }> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return { error: NextResponse.json({ error: "expected_json" }, { status: 415 }) };
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "invalid_json" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { error: NextResponse.json({ error: "invalid_body" }, { status: 400 }) };
  return { data: parsed.data };
}

/** 303 so a form POST becomes a GET on the target page. */
export function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, env().APP_URL), 303);
}
