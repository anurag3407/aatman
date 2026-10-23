import { defineConfig, devices } from "@playwright/test";

const PROD_PORT = 3123;
const DEV_PORT = 3124;

const testEnv = {
  DATABASE_URL: "pglite:memory",
  SESSION_SECRET: "e2e-session-secret-that-is-long-enough-0123456789",
  PSEUDONYM_KEY: "e2e-pseudonym-key-that-is-long-enough-0123456789",
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  ALLOWED_EMAIL_DOMAINS: "nitp.ac.in",
  COUNSELLOR_EMAILS: "counsellor@nitp.ac.in",
  ADMIN_EMAILS: "admin@nitp.ac.in",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { ...devices["Pixel 7"] },
  projects: [
    {
      // Production build: the service worker only registers there.
      name: "offline",
      testMatch: /offline-.*\.spec\.ts/,
      use: { baseURL: `http://localhost:${PROD_PORT}` },
    },
    {
      // Dev server with dev sign-in and the mock LLM, for full user journeys.
      name: "flows",
      testIgnore: /offline-.*\.spec\.ts/,
      use: { baseURL: `http://localhost:${DEV_PORT}` },
    },
  ],
  webServer: [
    {
      command: `pnpm build && pnpm start -p ${PROD_PORT}`,
      url: `http://localhost:${PROD_PORT}/crisis`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        ...testEnv,
        APP_URL: `http://localhost:${PROD_PORT}`,
        ALLOW_PGLITE_IN_PRODUCTION: "true",
        GOOGLE_CLIENT_ID: "e2e-unused",
        GOOGLE_CLIENT_SECRET: "e2e-unused",
        CRON_SECRET: "e2e-cron-secret-that-is-long-enough-0123456789",
        NOTIFY_WEBHOOK_URL: "http://127.0.0.1:9/e2e-unused",
        ALERT_EMAILS: "oncall@nitp.ac.in",
      },
    },
    {
      command: `pnpm next dev -p ${DEV_PORT}`,
      url: `http://localhost:${DEV_PORT}/crisis`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...testEnv,
        APP_URL: `http://localhost:${DEV_PORT}`,
        DEV_LOGIN: "true",
        LLM_PROVIDER: "mock",
      },
    },
  ],
});
