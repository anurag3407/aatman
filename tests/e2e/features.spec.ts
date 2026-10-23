import { expect, test } from "@playwright/test";
import { answerTier1, finishCampusAndSubmit, staffSignIn, studentSignIn } from "./helpers";

test("booking: counsellor creates slots, student books and shares, counsellor sees the shared check-in", async ({ page, browser }) => {
  const staff = await browser.newPage();
  await staffSignIn(staff, "counsellor@nitp.ac.in");
  await staff.goto("/counsellor/slots");
  const start = new Date(Date.now() + 2 * 86_400_000);
  const local = `${start.toISOString().slice(0, 10)}T10:00`;
  const room = `E2E Room ${Date.now()}`;
  await staff.getByLabel("First slot (IST)").fill(local);
  await staff.getByLabel("Back-to-back slots that day").fill("2");
  await staff.getByLabel("Location").fill(room);
  await staff.getByRole("button", { name: "Create slots" }).click();
  await expect(staff.getByRole("cell", { name: room })).toHaveCount(2);

  await studentSignIn(page);
  await answerTier1(page, "Not at all");
  await finishCampusAndSubmit(page);
  await page.goto("/book");
  await page.getByRole("button", { name: new RegExp(room) }).first().click();
  await page.getByLabel(/Share my latest check-in/).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked. See you then.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your upcoming sessions" })).toBeVisible();

  await staff.goto("/counsellor");
  await staff.getByRole("link", { name: new RegExp(`${room}.*Check-in shared`) }).click();
  await expect(staff.getByRole("heading", { name: "Shared check-in" })).toBeVisible();
  await expect(staff.getByText("Mild", { exact: true })).toBeVisible();
  await staff.close();
});

test("reflective chat: replies, blocks unsafe model output, and pauses on crisis language without calling the API", async ({ page }) => {
  await studentSignIn(page);
  await page.goto("/chat");
  const box = page.getByRole("textbox", { name: "What's on your mind?" });

  await box.fill("exams are stressing me out");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Mock reflection/)).toBeVisible();

  await box.fill("what should I take [mock:unsafe]");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I'm having trouble responding right now.")).toBeVisible();
  await expect(page.getByText(/sertraline/)).toHaveCount(0);

  let chatCalls = 0;
  page.on("request", (r) => r.url().includes("/api/chat") && chatCalls++);
  await box.fill("I want to kill myself");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Let's pause the chat here" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Call Tele-MANAS 14416" })).toBeVisible();
  expect(chatCalls).toBe(0);
});

test("Hindi: the language switch translates the app and the check-in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("खुद से हाल-चाल पूछने की एक शांत जगह");
  await expect(page.locator("div[lang=hi]").first()).toBeVisible();
  await page.goto("/checkin?mode=stateless");
  await expect(page.getByRole("button", { name: "बिल्कुल नहीं" })).toBeVisible();
  await page.context().clearCookies();
});

test("quick exit leaves for a neutral site and clears the draft", async ({ page }) => {
  await page.route("https://www.google.com/**", (r) => r.fulfill({ body: "<html><body>weather</body></html>", contentType: "text/html" }));
  await page.goto("/checkin?mode=stateless");
  await page.getByRole("button", { name: "Not at all", exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("aat_draft"))).not.toBeNull();
  await page.getByRole("button", { name: "Leave this site quickly" }).click();
  await expect(page).toHaveURL(/google\.com\/search\?q=weather/);
  await page.goBack().catch(() => undefined);
  expect(page.url()).not.toContain("/checkin");
});

test("exercises: box breathing and grounding work", async ({ page }) => {
  await page.goto("/exercises/breathing");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Breathe in")).toBeVisible();
  await page.goto("/exercises/grounding");
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Well done. Notice how you feel now.")).toBeVisible();
});

test("settings: export, then erase everything", async ({ page }) => {
  await studentSignIn(page);
  await answerTier1(page, "Not at all");
  await finishCampusAndSubmit(page);

  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download my data" }).click()]);
  const data = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  expect(data.checkins).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain("@nitp.ac.in");

  await page.getByLabel("Type ERASE to confirm").fill("ERASE");
  await page.getByRole("button", { name: "Erase my data" }).click();
  await expect(page.getByText("Your data has been erased.")).toBeVisible();
  await page.goto("/history");
  await expect(page).toHaveURL(/\/signin$/);
});
