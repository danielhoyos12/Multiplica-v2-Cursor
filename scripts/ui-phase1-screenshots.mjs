import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = "/opt/cursor/artifacts/screenshots";
mkdirSync(out, { recursive: true });
const base = "http://127.0.0.1:3000";

async function shot(name, width, height, path, interact) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("text=Neo Editorial", { timeout: 15000 }).catch(() => {});
  if (interact) await interact(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  await browser.close();
  console.log("saved", name);
}

async function main() {
  await shot("login-1440", 1440, 900, "/login");
  await shot("login-390", 390, 844, "/login");
  await shot("registro-430", 430, 932, "/ganar/registro");
  await shot("shell-1440", 1440, 900, "/ui-preview");
  await shot("shell-expanded-1440", 1440, 900, "/ui-preview", async (page) => {
    await page.getByRole("button", { name: "Expandir menú" }).click();
    await page.waitForTimeout(350);
  });
  await shot("shell-1180", 1180, 800, "/ui-preview");
  await shot("shell-1024", 1024, 768, "/ui-preview");
  await shot("shell-834", 834, 1112, "/ui-preview");
  await shot("shell-430", 430, 932, "/ui-preview");
  await shot("shell-360", 360, 740, "/ui-preview");
  await shot("shell-ruta-sheet-430", 430, 932, "/ui-preview", async (page) => {
    await page.getByRole("button", { name: "Ruta" }).click();
    await page.waitForTimeout(400);
  });
  await shot("shell-equipos-sheet-430", 430, 932, "/ui-preview", async (page) => {
    await page.getByRole("button", { name: "Equipos" }).click();
    await page.waitForTimeout(400);
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  await page.goto(`${base}/ui-preview`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Más" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/shell-iphone-mas.png` });
  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
