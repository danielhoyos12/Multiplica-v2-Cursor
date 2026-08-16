/**
 * Authenticated visual QA screenshots for Phase 5.
 * Requires running app + .env.e2e.local from provision-e2e-users.ts
 */
import { chromium, devices } from "@playwright/test";
import { config } from "dotenv";
import { mkdirSync } from "node:fs";

config({ path: ".env.e2e.local" });

const out = "/opt/cursor/artifacts/screenshots-phase5";
mkdirSync(out, { recursive: true });
const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

const email = process.env.E2E_SUPERADMIN_EMAIL;
const password = process.env.E2E_SUPERADMIN_PASSWORD;

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1180", width: 1180, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "834", width: 834, height: 1112 },
  { name: "430", width: 430, height: 932 },
  { name: "390", width: 390, height: 844 },
  { name: "360", width: 360, height: 740 },
];

const ROUTES = [
  { slug: "login", path: "/login", auth: false },
  { slug: "dashboard", path: "/dashboard", auth: true },
  { slug: "ganar", path: "/ganar", auth: true },
  { slug: "proceso-pre", path: "/proceso?etapa=pre", auth: true },
  { slug: "proceso-encuentro", path: "/proceso?etapa=encuentro", auth: true },
  { slug: "proceso-post", path: "/proceso?etapa=post", auth: true },
  { slug: "destino", path: "/destino", auth: true },
  { slug: "reencuentro", path: "/reencuentro", auth: true },
  { slug: "escuela-ministerial", path: "/escuela-ministerial", auth: true },
  { slug: "celulas", path: "/celulas", auth: true },
  { slug: "liderazgo", path: "/liderazgo", auth: true },
  { slug: "transferencias", path: "/transferencias", auth: true },
  { slug: "reportes", path: "/reportes", auth: true },
  { slug: "admin-users", path: "/admin/users", auth: true },
  { slug: "admin-ministries", path: "/admin/ministries", auth: true },
  { slug: "system-health", path: "/admin/system-health", auth: true },
  { slug: "udv", path: "/udv", auth: true },
];

async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/^correo$/i).fill(email);
  await page.getByLabel(/^contraseña$/i).fill(password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/(dashboard|cuenta)/, { timeout: 30_000 });
}

async function main() {
  if (!email || !password) {
    console.error("Missing E2E_SUPERADMIN_* — run provision-e2e-users.ts first");
    process.exit(1);
  }

  const browser = await chromium.launch();
  // Login once and reuse storage
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await login(page);
  await context.storageState({ path: "/tmp/e2e-phase5-state.json" });
  await browser.close();

  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      if (!route.auth && vp.name !== "1440" && vp.name !== "390") continue;
      // Full matrix for key surfaces; subset for login
      const keySurfaces = new Set([
        "login",
        "dashboard",
        "ganar",
        "proceso-pre",
        "liderazgo",
        "transferencias",
        "reportes",
        "udv",
      ]);
      if (!keySurfaces.has(route.slug) && vp.name !== "1440" && vp.name !== "390") {
        continue;
      }

      const b = await chromium.launch();
      const ctx = await b.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: route.auth ? "/tmp/e2e-phase5-state.json" : undefined,
      });
      const p = await ctx.newPage();
      const consoleErrors = [];
      p.on("pageerror", (e) => consoleErrors.push(e.message));
      await p.goto(`${base}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await p.waitForTimeout(500);
      const file = `${out}/${route.slug}-${vp.name}.png`;
      await p.screenshot({ path: file, fullPage: true });
      if (consoleErrors.length) {
        console.warn("pageerrors", route.slug, vp.name, consoleErrors.slice(0, 3));
      } else {
        console.log("saved", file);
      }
      await b.close();
    }
  }
  console.log("done", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
