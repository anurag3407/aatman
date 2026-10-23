import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "@/lib/privacy/fieldCrypto";
import { scrubPii } from "@/lib/privacy/piiScrub";
import { pseudonymFor } from "@/lib/privacy/pseudonym";

const KEY = Buffer.alloc(32, 1).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 2).toString("base64");

describe("pseudonymFor", () => {
  it("is stable and case-insensitive", () => {
    expect(pseudonymFor("Student@NITP.ac.in ", "k".repeat(32))).toBe(pseudonymFor("student@nitp.ac.in", "k".repeat(32)));
  });

  it("depends on the key, so it can't be recomputed without it", () => {
    expect(pseudonymFor("a@nitp.ac.in", "k".repeat(32))).not.toBe(pseudonymFor("a@nitp.ac.in", "j".repeat(32)));
  });

  it("doesn't contain the email", () => {
    expect(pseudonymFor("rahul@nitp.ac.in", "k".repeat(32))).not.toMatch(/rahul|nitp/);
  });
});

describe("field encryption", () => {
  it("round-trips JSON", () => {
    const value = { phq9: [1, 2, null], note: "हिंदी ✓" };
    expect(decryptJson(encryptJson(value, "p_owner", KEY), "p_owner", KEY)).toEqual(value);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptJson("same", "p", KEY)).not.toBe(encryptJson("same", "p", KEY));
  });

  it("fails if the ciphertext is moved to another owner", () => {
    const sealed = encryptJson({ a: 1 }, "p_alice", KEY);
    expect(() => decryptJson(sealed, "p_bob", KEY)).toThrow();
  });

  it("fails with the wrong key or tampered data", () => {
    const sealed = encryptJson({ a: 1 }, "p", KEY);
    expect(() => decryptJson(sealed, "p", OTHER_KEY)).toThrow();
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(() => decryptJson(tampered, "p", KEY)).toThrow();
  });
});

describe("scrubPii", () => {
  it.each([
    ["mail me at rahul.k@nitp.ac.in", "mail me at [email]"],
    ["call 9876543210", "call [phone]"],
    ["my number is +91 98765 43210", "my number is [phone]"],
    ["roll no 2106123 here", "roll no [id] here"],
    ["see https://example.com/x", "see [link]"],
    ["I live in room 214", "I live in [room]"],
    ["Sharma sir shouted at me", "[name] sir shouted at me"],
    ["my roommate Rahul Verma is loud", "my roommate [name] is loud"],
    ["my name is Priya", "my name is [name]"],
    ["Prof. Gupta gave me an F", "Prof [name] gave me an F"],
  ])("%s", (input, expected) => {
    expect(scrubPii(input)).toBe(expected);
  });

  it("removes configured hostel names", () => {
    expect(scrubPii("noise in Brahmaputra hostel", { hostelNames: ["brahmaputra"] })).toBe("noise in [hostel] hostel");
  });

  it("leaves ordinary text alone", () => {
    const text = "I have 3 exams in 2 weeks and feel tired";
    expect(scrubPii(text)).toBe(text);
  });
});
