import { expect, type Page } from "@playwright/test";

let seq = 0;
export const uniqueEmail = (prefix = "student") => `${prefix}${Date.now()}${++seq}@nitp.ac.in`;

/** Consent (adult) → dev sign-in. Lands on /checkin. */
export async function studentSignIn(page: Page, email = uniqueEmail()) {
  await page.goto("/consent");
  await page.getByRole("button", { name: "Yes, I'm 18 or older" }).click();
  await page.getByRole("button", { name: "I understand and agree" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await page.getByLabel("Test email").fill(email);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/checkin$/);
  return email;
}

export async function staffSignIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.getByLabel("Test email").fill(email);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Click an answer button for the current question. */
export async function choose(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

/** A tier-1 check-in with all-low answers. Item 9 is passed in. */
export async function answerTier1(page: Page, item9: string) {
  for (let i = 0; i < 4; i++) await choose(page, "Not at all");
  await expect(page.getByRole("heading", { name: /better off dead/ })).toBeVisible();
  await choose(page, item9);
}

export async function finishCampusAndSubmit(page: Page) {
  await choose(page, "Good");
  await choose(page, "Not at all");
  await choose(page, "Yes, easily");
  await choose(page, "Not at all");
  await choose(page, "No");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "See my results" }).click();
}
