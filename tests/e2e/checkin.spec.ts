import { expect, test } from "@playwright/test";
import { answerTier1, choose, finishCampusAndSubmit, staffSignIn, studentSignIn, uniqueEmail } from "./helpers";

test("unknown visitors go to consent before anything else", async ({ page }) => {
  await page.goto("/checkin");
  await expect(page).toHaveURL(/\/consent$/);
});

test("mild check-in: 9 questions, AI note from scores, self-care first", async ({ page }) => {
  await studentSignIn(page);
  await answerTier1(page, "Not at all");
  await finishCampusAndSubmit(page);

  await expect(page).toHaveURL(/\/results\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You seem to be coping reasonably well right now.");
  await expect(page.getByText(/^Mock note/)).toBeVisible();
  await expect(page.getByText("Written with AI from your scores only")).toBeVisible();
  await expect(page.getByRole("link", { name: "Call Tele-MANAS 14416" })).toHaveCount(0);

  // Appears in history.
  await page.goto("/history");
  await expect(page.getByText("Low distress")).toBeVisible();
});

test("positive item 9 shows support inline, asks C-SSRS, and a high-risk answer ends in crisis support", async ({ page, browser }) => {
  await studentSignIn(page);
  await answerTier1(page, "Nearly every day");

  await expect(page.getByText("If you're in danger right now, call Tele-MANAS 14416")).toBeVisible();
  await expect(page.getByText("A few yes/no questions about the past month")).toBeVisible();
  await choose(page, "Yes"); // wish to be dead
  await choose(page, "Yes"); // active thoughts
  await choose(page, "Yes"); // method
  await choose(page, "Yes"); // intent
  await choose(page, "No"); // plan
  await choose(page, "No"); // behaviour ever

  // High risk ends the check-in: no campus or free-text questions.
  await page.getByRole("button", { name: "See my results" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your safety matters most right now.");
  await expect(page.getByRole("link", { name: "Call Tele-MANAS 14416" })).toHaveAttribute("href", "tel:14416");
  await expect(page.getByRole("link", { name: "Call 112" })).toHaveAttribute("href", "tel:112");
  // Crisis copy is the clinician template, never the LLM.
  await expect(page.getByText(/Mock note/)).toHaveCount(0);
  await expect(page.getByText("Your safety matters most right now. Please call Tele-MANAS")).toBeVisible();

  // Opt in to be contacted.
  await page.getByLabel("Phone number").fill("9876543210");
  await page.getByLabel(/I agree to share my latest check-in/).check();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/^Sent\. The counselling team/)).toBeVisible();

  // The counsellor sees it at the top of the queue, with the phone number and C-SSRS answers.
  const staff = await browser.newPage();
  await staffSignIn(staff, "counsellor@nitp.ac.in");
  await expect(staff).toHaveURL(/\/counsellor$/);
  await staff.getByRole("link", { name: /Crisis/ }).first().click();
  await expect(staff.getByRole("link", { name: "9876543210" })).toBeVisible();
  await expect(staff.getByText("C-SSRS screener (past month) · risk: high")).toBeVisible();
  await expect(staff.getByText("Intent: Yes")).toBeVisible();
  await staff.getByRole("button", { name: "Mark contacted" }).click();
  await expect(staff.getByText(/status: contacted/)).toBeVisible();
  await staff.close();
});

test("free text with crisis language escalates even when every answer is low", async ({ page }) => {
  await studentSignIn(page);
  await answerTier1(page, "Not at all");
  await choose(page, "Good");
  await choose(page, "Not at all");
  await choose(page, "Yes, easily");
  await choose(page, "Not at all");
  await choose(page, "No");
  await page.getByRole("textbox").fill("sab khatam kar dunga");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "See my results" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your safety matters most right now.");
});

test("positive PHQ-2 offers the deeper check and scores the full PHQ-9", async ({ page }) => {
  await studentSignIn(page);
  await choose(page, "More than half the days");
  await choose(page, "More than half the days");
  await choose(page, "Not at all");
  await choose(page, "Not at all");
  await choose(page, "Not at all"); // item 9
  await choose(page, "Poor");
  await choose(page, "Quite a bit");
  await choose(page, "Yes, easily");
  await choose(page, "Not at all");
  await choose(page, "No");
  await expect(page.getByRole("heading", { name: "Would you like a deeper 3-minute check?" })).toBeVisible();
  await choose(page, "Yes, continue");
  for (let i = 0; i < 6; i++) await choose(page, "Several days");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "See my results" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You've been carrying quite a lot lately.");
  await expect(page.getByText(/sleep has been rough/)).toBeVisible();
  await page.getByText("Details").click();
  await expect(page.getByText("(10/27)")).toBeVisible();
});

test("under-18 mode never sends answers to the server", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => r.method() === "POST" && posts.push(r.url()));

  await page.goto("/consent");
  await page.getByRole("button", { name: "No, I'm under 18" }).click();
  await page.getByRole("link", { name: "Start without saving" }).click();
  await expect(page.getByText("Not saving. Results stay on this device.")).toBeVisible();
  await answerTier1(page, "Not at all");
  await finishCampusAndSubmit(page);

  await expect(page).toHaveURL(/\/results\/local$/);
  await expect(page.getByText("These results are only on this device")).toBeVisible();
  expect(posts.filter((u) => u.includes("/api/"))).toEqual([]);
});

test("the API refuses unauthenticated and cross-site writes", async ({ request, baseURL }) => {
  const body = { answers: { phq9: Array(9).fill(0), gad7: Array(7).fill(0) }, campus: { sleep: 0, academics: 0, social: 0, substances: 0, safety: "no" }, locale: "en" };
  const anon = await request.post("/api/checkins", { data: body, headers: { origin: baseURL! } });
  expect(anon.status()).toBe(401);
  const crossSite = await request.post("/api/checkins", { data: body, headers: { origin: "https://evil.example" } });
  expect(crossSite.status()).toBe(403);
});

test("students can't open staff pages, and admins see aggregates only", async ({ page, browser }) => {
  await studentSignIn(page, uniqueEmail());
  await page.goto("/counsellor");
  await expect(page).toHaveURL(/\/$/);

  const admin = await browser.newPage();
  await staffSignIn(admin, "admin@nitp.ac.in");
  await expect(admin).toHaveURL(/\/admin$/);
  await expect(admin.getByRole("heading", { name: "Wellbeing overview" })).toBeVisible();
  await admin.goto("/counsellor");
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.close();
});

test("a server error on save still shows a crisis-tier student the helplines", async ({ page }) => {
  await studentSignIn(page);
  await page.route("**/api/checkins", (route) => route.fulfill({ status: 500, body: "{}" }));
  await answerTier1(page, "Nearly every day");
  await choose(page, "Yes"); // wish to be dead
  await choose(page, "Yes"); // active thoughts
  await choose(page, "Yes"); // method
  await choose(page, "Yes"); // intent
  await choose(page, "No"); // plan
  await choose(page, "No"); // behaviour ever
  await page.getByRole("button", { name: "See my results" }).click();

  await expect(page).toHaveURL(/\/results\/local$/);
  await expect(page.getByText(/We couldn't save this check-in/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Call Tele-MANAS 14416" })).toHaveAttribute("href", "tel:14416");
  await expect(page.getByRole("link", { name: "Call 112" })).toHaveAttribute("href", "tel:112");
});
