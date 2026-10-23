import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside React Server Components; tests run server code directly.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Each test file gets its own in-memory Postgres (PGlite) with migrations applied.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "pglite:memory",
      SESSION_SECRET: "test-session-secret-that-is-long-enough-0123456789",
      PSEUDONYM_KEY: "test-pseudonym-key-that-is-long-enough-0123456789",
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      ALLOWED_EMAIL_DOMAINS: "nitp.ac.in",
      LLM_PROVIDER: "mock",
    },
    testTimeout: 20_000,
  },
});
