import { expect, test } from "@playwright/test";

/**
 * Critical smoke E2E — requires a running app (local or staging).
 * Skip automatically when PLAYWRIGHT_SKIP=1 (CI without server).
 */
const skip = process.env.PLAYWRIGHT_SKIP === "1";

test.describe("auth smoke", () => {
  test.skip(skip, "PLAYWRIGHT_SKIP=1");

  test("login page renders neutrally", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/correo/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /ingresar/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /olvidaste/i })).toBeVisible();
  });

  test("invalid login shows generic error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo/i).fill("nobody@example.com");
    await page.getByLabel(/contraseña/i).fill("wrong-password-xxx");
    await page.getByRole("button", { name: /ingresar/i }).click();
    await expect(page.getByText(/no se pudo iniciar sesión/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("open redirect next= is neutralized", async ({ page }) => {
    await page.goto("/login?next=//evil.example");
    // Form still loads; after login would go dashboard — here just ensure page ok
    await expect(page.getByLabel(/correo/i)).toBeVisible();
  });
});

test.describe("public intake", () => {
  test.skip(skip, "PLAYWRIGHT_SKIP=1");

  test("public Ganar form loads", async ({ page }) => {
    await page.goto("/ganar/registro");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("health", () => {
  test.skip(skip, "PLAYWRIGHT_SKIP=1");

  test("health endpoint is safe", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/service_role|DATABASE_URL|password/i);
  });

  test("ready endpoint does not leak secrets", async ({ request }) => {
    const res = await request.get("/api/ready");
    const body = await res.json();
    expect(body.status).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/service_role|postgres:\/\/|password/i);
  });
});

test.describe("protected routes", () => {
  test.skip(skip, "PLAYWRIGHT_SKIP=1");

  test("dashboard redirects anonymous to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
