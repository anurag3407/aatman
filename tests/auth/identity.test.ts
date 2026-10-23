import { describe, expect, it } from "vitest";
import { evaluateIdentity, type IdentityPolicy } from "@/lib/auth/identity";

const policy: IdentityPolicy = {
  allowedDomains: ["nitp.ac.in"],
  microsoftTenantId: "tenant-123",
  counsellorEmails: ["counsellor@nitp.ac.in"],
  adminEmails: ["dean@nitp.ac.in"],
};

describe("Google", () => {
  const ok = { email: "Student@nitp.ac.in", email_verified: true, hd: "nitp.ac.in" };

  it("accepts a verified Workspace account and lowercases the email", () => {
    expect(evaluateIdentity("google", ok, policy)).toEqual({ ok: true, email: "student@nitp.ac.in", role: "student" });
  });

  it("rejects personal Gmail even if the address looks right (no hd claim)", () => {
    expect(evaluateIdentity("google", { ...ok, hd: undefined }, policy)).toEqual({ ok: false, reason: "wrong_domain" });
  });

  it("rejects another Workspace domain", () => {
    expect(evaluateIdentity("google", { email: "x@iitp.ac.in", email_verified: true, hd: "iitp.ac.in" }, policy)).toMatchObject({
      ok: false,
    });
  });

  it("rejects unverified email", () => {
    expect(evaluateIdentity("google", { ...ok, email_verified: false }, policy)).toEqual({ ok: false, reason: "unverified" });
  });

  it("rejects an hd/email mismatch", () => {
    expect(evaluateIdentity("google", { ...ok, email: "x@gmail.com" }, policy)).toEqual({ ok: false, reason: "wrong_domain" });
  });
});

describe("Microsoft", () => {
  it("requires the institute tenant", () => {
    expect(evaluateIdentity("microsoft", { email: "a@nitp.ac.in", tid: "tenant-123" }, policy)).toMatchObject({ ok: true });
    expect(evaluateIdentity("microsoft", { email: "a@nitp.ac.in", tid: "other" }, policy)).toEqual({ ok: false, reason: "wrong_tenant" });
  });

  it("falls back to preferred_username", () => {
    expect(evaluateIdentity("microsoft", { preferred_username: "a@nitp.ac.in", tid: "tenant-123" }, policy)).toMatchObject({
      ok: true,
      email: "a@nitp.ac.in",
    });
  });

  it("needs an email", () => {
    expect(evaluateIdentity("microsoft", { tid: "tenant-123" }, policy)).toEqual({ ok: false, reason: "no_email" });
  });
});

describe("roles", () => {
  it("assigns staff roles from the allow-lists", () => {
    const base = { email_verified: true, hd: "nitp.ac.in" };
    expect(evaluateIdentity("google", { ...base, email: "counsellor@nitp.ac.in" }, policy)).toMatchObject({ role: "counsellor" });
    expect(evaluateIdentity("google", { ...base, email: "DEAN@nitp.ac.in" }, policy)).toMatchObject({ role: "admin" });
  });
});
