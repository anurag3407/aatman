import { afterEach, describe, expect, it } from "vitest";
import { devLoginEnabled, env, resetEnvCache } from "@/lib/env";

const original = { ...process.env };

function withEnv(vars: Record<string, string | undefined>) {
  process.env = { ...original, ...vars } as NodeJS.ProcessEnv;
  resetEnvCache();
}

afterEach(() => {
  process.env = original;
  resetEnvCache();
});

const prodBase = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://u:p@db.example:5432/aatman",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  CRON_SECRET: "c".repeat(40),
  DEV_LOGIN: "false",
  LLM_PROVIDER: "none",
  NOTIFY_WEBHOOK_URL: "https://relay.example/send",
  ALERT_EMAILS: "oncall@nitp.ac.in",
};

describe("env", () => {
  it("treats empty values from .env files as unset", () => {
    withEnv({ OPENAI_COMPAT_BASE_URL: "", GOOGLE_CLIENT_ID: "", LLM_MODEL: "" });
    expect(env().OPENAI_COMPAT_BASE_URL).toBeUndefined();
  });

  it("rejects a short secret or a wrong-size encryption key", () => {
    withEnv({ SESSION_SECRET: "short" });
    expect(() => env()).toThrow(/SESSION_SECRET/);
    withEnv({ DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") });
    expect(() => env()).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("accepts a safe production configuration", () => {
    withEnv(prodBase);
    expect(env().NODE_ENV).toBe("production");
  });

  it.each([
    [{ DEV_LOGIN: "true" }, /DEV_LOGIN/],
    [{ LLM_PROVIDER: "mock" }, /mock/],
    [{ DATABASE_URL: "pglite:memory" }, /Postgres/],
    [{ CRON_SECRET: undefined }, /CRON_SECRET/],
    [{ GOOGLE_CLIENT_ID: undefined }, /SSO/],
    [{ NOTIFY_WEBHOOK_URL: undefined }, /NOTIFY_WEBHOOK_URL/],
    [{ ALERT_EMAILS: undefined }, /ALERT_EMAILS/],
  ])("refuses unsafe production setting %o", (override, message) => {
    withEnv({ ...prodBase, ...override });
    expect(() => env()).toThrow(message);
  });

  it("never enables dev login in production", () => {
    withEnv({ NODE_ENV: "development", DEV_LOGIN: "true" });
    expect(devLoginEnabled()).toBe(true);
    withEnv({ ...prodBase });
    expect(devLoginEnabled()).toBe(false);
  });
});
