import { expect, test, type Page } from "@playwright/test";

/** Visit once online and wait until the service worker controls the page. */
async function primeServiceWorker(page: Page) {
  await page.goto("/crisis");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
}

test("crisis page renders, styled, with no network", async ({ page, context }) => {
  await primeServiceWorker(page);
  await context.setOffline(true);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("You don't have to go through this alone");
  const teleManas = page.getByRole("link", { name: /Call 14416/ });
  await expect(teleManas).toHaveAttribute("href", "tel:14416");
  await expect(page.getByRole("link", { name: /Call 112/ })).toHaveAttribute("href", "tel:112");

  // The precached stylesheet applied: the primary call button has the accent background, not the browser default.
  const bg = await teleManas.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
});

test("any page opened offline falls back to the crisis page", async ({ page, context }) => {
  await primeServiceWorker(page);
  await context.setOffline(true);

  await page.goto("/");
  await expect(page).toHaveURL(/\/crisis$/);
  await expect(page.getByRole("link", { name: /Call 14416/ })).toBeVisible();
});

test("exercise pages visited once keep working offline", async ({ page, context }) => {
  await primeServiceWorker(page);
  await page.goto("/exercises/breathing");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await context.setOffline(true);

  await page.reload();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Breathe in")).toBeVisible();
});

test("crisis page shows Hindi alongside English", async ({ page }) => {
  await page.goto("/crisis");
  await expect(page.locator('[lang="hi"]').first()).toContainText("आपको यह अकेले नहीं झेलना है");
});
