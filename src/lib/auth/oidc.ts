import "server-only";
import * as oidc from "openid-client";
import { env, googleConfigured, microsoftConfigured } from "@/lib/env";
import type { Provider } from "./identity";

/** Authorization-code flow with PKCE, state and nonce (openid-client v6). */

const configs = new Map<Provider, Promise<oidc.Configuration>>();

function issuerFor(provider: Provider): { issuer: string; clientId: string; clientSecret: string } {
  const e = env();
  if (provider === "google") {
    if (!googleConfigured(e)) throw new Error("Google SSO is not configured");
    return { issuer: "https://accounts.google.com", clientId: e.GOOGLE_CLIENT_ID!, clientSecret: e.GOOGLE_CLIENT_SECRET! };
  }
  if (!microsoftConfigured(e)) throw new Error("Microsoft SSO is not configured");
  return {
    // Tenant-specific issuer: only accounts from the institute's Entra tenant can sign in.
    issuer: `https://login.microsoftonline.com/${e.MICROSOFT_TENANT_ID}/v2.0`,
    clientId: e.MICROSOFT_CLIENT_ID!,
    clientSecret: e.MICROSOFT_CLIENT_SECRET!,
  };
}

function configFor(provider: Provider): Promise<oidc.Configuration> {
  let cfg = configs.get(provider);
  if (!cfg) {
    const { issuer, clientId, clientSecret } = issuerFor(provider);
    cfg = oidc.discovery(new URL(issuer), clientId, clientSecret).catch((err) => {
      configs.delete(provider);
      throw err;
    });
    configs.set(provider, cfg);
  }
  return cfg;
}

export function redirectUri(provider: Provider, host?: string): string {
  const base = host ? (host.startsWith("http") ? host : `https://${host}`) : env().APP_URL;
  return new URL(`/api/auth/callback/${provider}`, base).toString();
}

export interface PendingLogin {
  provider: Provider;
  verifier: string;
  state: string;
  nonce: string;
}

export async function beginLogin(provider: Provider, host?: string): Promise<{ url: URL; pending: PendingLogin }> {
  const config = await configFor(provider);
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const params: Record<string, string> = {
    redirect_uri: redirectUri(provider, host),
    scope: "openid email profile",
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state,
    nonce,
    prompt: "select_account",
  };
  // A hint only (shows institute accounts first). The `hd` claim is still verified on return.
  if (provider === "google") params.hd = env().ALLOWED_EMAIL_DOMAINS[0];
  return { url: oidc.buildAuthorizationUrl(config, params), pending: { provider, verifier, state, nonce } };
}

/** Exchanges the code and returns verified ID-token claims. */
export async function finishLogin(pending: PendingLogin, callbackUrl: URL): Promise<oidc.IDToken> {
  const config = await configFor(pending.provider);
  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: pending.verifier,
    expectedState: pending.state,
    expectedNonce: pending.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) throw new Error("No ID token returned");
  return claims;
}
