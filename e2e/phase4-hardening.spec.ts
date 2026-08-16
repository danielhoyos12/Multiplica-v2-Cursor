import { expect, test } from "@playwright/test";

/**
 * Phase 4 export/authz smoke — skips without server or when PLAYWRIGHT_SKIP=1.
 * Full authenticated denial requires seeded credentials (documented in entrega).
 */
const skip = process.env.PLAYWRIGHT_SKIP === "1";

test.describe("Phase 4 protected surfaces", () => {
  test.skip(skip, "PLAYWRIGHT_SKIP=1");

  test("reportes redirects anonymous to login", async ({ page }) => {
    await page.goto("/reportes");
    await expect(page).toHaveURL(/\/login/);
  });

  test("transferencias redirects anonymous to login", async ({ page }) => {
    await page.goto("/transferencias");
    await expect(page).toHaveURL(/\/login/);
  });

  test("liderazgo redirects anonymous to login", async ({ page }) => {
    await page.goto("/liderazgo");
    await expect(page).toHaveURL(/\/login/);
  });

  test("favicon metadata serves brand app icon", async ({ request }) => {
    const res = await request.get("/brand/app-icon.svg");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toMatch(/svg/i);
  });
});
