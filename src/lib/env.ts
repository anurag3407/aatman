import "server-only";
import { z } from "zod";

/**
 * Server configuration, validated once on first use. Production refuses to start
 * with unsafe settings (dev login, mock LLM, missing keys) instead of running degraded.
 */

const list = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),

  /** `postgres://…` in production; `pglite:memory` or `pglite:<dir>` for local dev and tests. */
  DATABASE_URL: z.string().default("pglite:./.data/pglite"),
  /** Postgres connections per app instance. Keep instances × this below the server's max_connections. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  /** HMAC key that turns an institute email into a pseudonym. Losing it orphans every account; never rotate casually. */
  PSEUDONYM_KEY: z.string().min(32, "PSEUDONYM_KEY must be at least 32 characters"),
  /** Base64, 32 bytes. AES-256-GCM key for field-level encryption. */
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine((s) => Buffer.from(s, "base64").length === 32, "DATA_ENCRYPTION_KEY must be 32 bytes, base64"),

  ALLOWED_EMAIL_DOMAINS: list.pipe(z.array(z.string()).min(1, "ALLOWED_EMAIL_DOMAINS is required")),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),

  COUNSELLOR_EMAILS: list,
  ADMIN_EMAILS: list,
  /** Fallback recipients when no on-call shift covers the moment. Also the backup escalation target. */
  ALERT_EMAILS: list,
  CLINICAL_LEAD_EMAILS: list,
  /** Generic email transport: POST { to, subject, text } with an optional bearer token. */
  NOTIFY_WEBHOOK_URL: z.url().optional(),
  NOTIFY_WEBHOOK_TOKEN: z.string().optional(),
  /** SMS transport for appointment reminders. Receives POST { to, text }. */
  SMS_WEBHOOK_URL: z.url().optional(),
  SMS_WEBHOOK_TOKEN: z.string().optional(),

  /** Sign in as any test email without SSO. Never allowed in production. */
  DEV_LOGIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  LLM_PROVIDER: z.enum(["none", "anthropic", "openai_compat", "mock"]).default("none"),
  LLM_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  /** Server-side refusal fallback on the Anthropic API. Disable if your data agreement requires a single model. */
  LLM_REFUSAL_FALLBACK: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_COMPAT_BASE_URL: z.url().optional(),
  OPENAI_COMPAT_API_KEY: z.string().optional(),

  CRON_SECRET: z.string().min(32).optional(),
  RETENTION_MONTHS: z.coerce.number().int().min(1).max(60).default(12),
  /** Comma-separated hostel / block names to strip before text reaches an LLM. */
  HOSTEL_NAMES: list,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  // `KEY=` lines in .env files arrive as "": treat them as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example (or run \`pnpm setup:env\`).`);
  }
  const e = parsed.data;

  if (e.NODE_ENV === "production") {
    const problems: string[] = [];
    if (e.DEV_LOGIN) problems.push("DEV_LOGIN must be false in production");
    if (e.LLM_PROVIDER === "mock") problems.push("LLM_PROVIDER=mock is for tests only");
    if (e.DATABASE_URL.startsWith("pglite:") && process.env.ALLOW_PGLITE_IN_PRODUCTION !== "true") {
      problems.push("Use a managed Postgres DATABASE_URL in production");
    }
    if (!e.CRON_SECRET) problems.push("CRON_SECRET is required so data retention and crisis-alert escalation run");
    // Crisis and urgent check-ins page staff. Without these, alerts are queued and never delivered.
    if (!e.NOTIFY_WEBHOOK_URL) problems.push("NOTIFY_WEBHOOK_URL is required so crisis alerts reach staff");
    if (!e.ALERT_EMAILS.length) problems.push("ALERT_EMAILS is required as the crisis-alert fallback when no on-call shift is set");
    if (!googleConfigured(e) && !microsoftConfigured(e)) problems.push("Configure Google or Microsoft SSO");
    if (problems.length) throw new Error(`Unsafe production configuration:\n  ${problems.join("\n  ")}`);
  }

  cached = e;
  return e;
}

export function googleConfigured(e: Env = env()): boolean {
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}

export function microsoftConfigured(e: Env = env()): boolean {
  return Boolean(e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET && e.MICROSOFT_TENANT_ID);
}

export function devLoginEnabled(e: Env = env()): boolean {
  return e.DEV_LOGIN && e.NODE_ENV !== "production";
}

/** Tests reset the cache after changing process.env. */
export function resetEnvCache() {
  cached = undefined;
}
