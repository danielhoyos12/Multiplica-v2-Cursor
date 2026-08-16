import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = "/opt/cursor/artifacts/screenshots";
mkdirSync(out, { recursive: true });
const base = "http://127.0.0.1:3000";

async function shot(name, width, height, path, interact) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("text=Dashboard", { timeout: 20000 });
  if (interact) await interact(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await browser.close();
  console.log("saved", name);
}

async function main() {
  await shot("dashboard-1440", 1440, 900, "/ui-preview");
  await shot("dashboard-1180", 1180, 800, "/ui-preview");
  await shot("dashboard-1024", 1024, 768, "/ui-preview");
  await shot("dashboard-834", 834, 1112, "/ui-preview");
  await shot("dashboard-430", 430, 932, "/ui-preview");
  await shot("dashboard-390", 390, 844, "/ui-preview");
  await shot("dashboard-360", 360, 740, "/ui-preview");

  await shot("ladder-1440", 1440, 900, "/ui-preview", async (page) => {
    await page.getByText("Ruta pastoral").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
  });

  await shot("alerts-1440", 1440, 900, "/ui-preview", async (page) => {
    await page.getByText("Alertas pastorales").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
  });

  await shot("filters-active-1440", 1440, 900, "/ui-preview?periodo=last_30&ministerio=m1&red=n1");

  await shot("empty-1440", 1440, 900, "/ui-preview?view=empty");
  await shot("empty-430", 430, 932, "/ui-preview?view=empty");

  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
