// Creates .env.local for local development with fresh random secrets.
// Usage: pnpm setup:env  (won't overwrite an existing .env.local)
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = ".env.local";
if (existsSync(target)) {
  console.log(`${target} already exists; leaving it alone.`);
  process.exit(0);
}

const values = {
  SESSION_SECRET: randomBytes(48).toString("base64"),
  PSEUDONYM_KEY: randomBytes(48).toString("base64"),
  DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  DEV_LOGIN: "true",
  COUNSELLOR_EMAILS: "counsellor@nitp.ac.in",
  ADMIN_EMAILS: "admin@nitp.ac.in",
};

const out = readFileSync(".env.example", "utf8")
  .split("\n")
  .map((line) => {
    const key = line.split("=")[0];
    return key in values ? `${key}=${values[key]}` : line;
  })
  .join("\n");

writeFileSync(target, out, { mode: 0o600 });
console.log(`Wrote ${target}. Dev sign-in is on: use any @nitp.ac.in email, counsellor@nitp.ac.in or admin@nitp.ac.in.`);
