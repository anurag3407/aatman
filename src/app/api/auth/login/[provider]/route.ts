import { NextResponse, type NextRequest } from "next/server";
import { beginLogin } from "@/lib/auth/oidc";
import { signTemp } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { redirectTo } from "@/lib/http";

const OIDC_COOKIE = "aat_o";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") return redirectTo("/signin?error=failed");

  try {
    const { url, pending } = await beginLogin(provider);
    const res = NextResponse.redirect(url);
    res.cookies.set(OIDC_COOKIE, await signTemp({ ...pending }, 600), {
      httpOnly: true,
      secure: env().NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/callback",
      maxAge: 600,
    });
    return res;
  } catch (err) {
    console.error("[auth] could not start login", err instanceof Error ? err.message : err);
    return redirectTo("/signin?error=failed");
  }
}
