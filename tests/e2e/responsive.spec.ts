import { expect, test, type Page } from "@playwright/test";
import { answerTier1, finishCampusAndSubmit, staffSignIn, studentSignIn } from "./helpers";

const PUBLIC_PAGES = ["/", "/checkin?mode=stateless", "/exercises", "/crisis", "/consent", "/signin", "/privacy"];

const SIZES = [
  { name: "mobile", width: 390, height: 844, isMobile: true },
  { name: "tablet", width: 768, height: 1024, isMobile: false },
  { name: "desktop", width: 1440, height: 900, isMobile: false },
] as const;

const LANDING_DESKTOP_SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;

const LANDING_MOBILE_SIZES = [
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
] as const;

async function expectLandingFitsOneScreen(page: Page, message: string) {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(overflow, message).toBeLessThanOrEqual(1);
}

for (const size of LANDING_DESKTOP_SIZES) {
  test.describe(`landing fits one screen at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: false, hasTouch: false });

    test("no vertical scrolling", async ({ page }) => {
      await expectLandingFitsOneScreen(page, "landing should fit in one desktop screen");
    });
  });
}

for (const size of LANDING_MOBILE_SIZES) {
  test.describe(`landing fits one mobile screen at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: true, hasTouch: true });

    test("no vertical scrolling", async ({ page }) => {
      await expectLandingFitsOneScreen(page, "landing should fit in one mobile screen");
    });

    test("no vertical scrolling in Hindi", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => {
        document.cookie = "aat_lang=hi; path=/";
      });
      await page.reload();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
      );
      expect(overflow, "Hindi landing should fit in one mobile screen").toBeLessThanOrEqual(1);
    });
  });
}

async function expectNoHorizontalOverflow(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("body")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${path} causes horizontal scrolling`).toBeLessThanOrEqual(1);
}

for (const size of SIZES) {
  test.describe(`${size.name} (${size.width}px)`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.isMobile, hasTouch: size.isMobile });

    test("public pages fit without horizontal scrolling", async ({ page }) => {
      for (const path of PUBLIC_PAGES) {
        await expectNoHorizontalOverflow(page, path);
      }
    });
  });
}

test.describe("signed-in student pages at desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test("student pages fit without horizontal scrolling", async ({ page }) => {
    await studentSignIn(page);
    await answerTier1(page, "Not at all");
    await finishCampusAndSubmit(page);
    await expect(page).toHaveURL(/\/results\/[0-9a-f-]+$/);

    const resultPath = new URL(page.url()).pathname;
    for (const path of [resultPath, "/history", "/book", "/settings", "/exercises/breathing"]) {
      await expectNoHorizontalOverflow(page, path);
    }
  });
});

test.describe("staff pages at desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test("staff pages fit without horizontal scrolling", async ({ page }) => {
    await staffSignIn(page, "counsellor@nitp.ac.in");
    await expect(page).toHaveURL(/\/counsellor$/);

    for (const path of ["/counsellor", "/counsellor/slots", "/admin"]) {
      await expectNoHorizontalOverflow(page, path);
    }
  });
});
