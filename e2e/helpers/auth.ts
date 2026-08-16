import { expect, type Page } from "@playwright/test";

export type E2ERole =
  | "SUPERADMIN"
  | "LEADER_GENERAL"
  | "LEADER"
  | "STAFF";

export function e2eCreds(role: E2ERole): { email: string; password: string } | null {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

export function hasE2ECreds(...roles: E2ERole[]) {
  return roles.every((r) => e2eCreds(r));
}

export async function loginAs(page: Page, role: E2ERole) {
  const creds = e2eCreds(role);
  if (!creds) throw new Error(`Missing E2E_${role}_EMAIL/PASSWORD`);
  await page.goto("/login");
  await page.getByLabel(/^correo$/i).fill(creds.email);
  await page.getByLabel(/^contraseña$/i).fill(creds.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|cuenta)/, { timeout: 30_000 });
}

export async function logout(page: Page) {
  // Prefer dock "Más" on mobile viewports; sidebar form on desktop
  const more = page.getByRole("button", { name: /más|more/i }).first();
  if (await more.isVisible().catch(() => false)) {
    await more.click();
  }
  const signOut = page.getByRole("button", { name: /cerrar sesión/i }).first();
  if (await signOut.isVisible().catch(() => false)) {
    await signOut.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    return;
  }
  // Fallback: clear cookies
  await page.context().clearCookies();
  await page.goto("/login");
}
