/**
 * Phase 5 export security E2E against live DB (not production).
 * Uses provisioned E2E user ids from .env.e2e.local
 */
import { config } from "dotenv";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import {
  exportReportCsv,
  exportReportPrintHtml,
  exportReportXlsx,
} from "@/modules/reporting";

config({ path: ".env.local" });
config({ path: ".env.e2e.local", override: false });

const APP_ENV = process.env.APP_ENV ?? "local";

function record(results: { name: string; pass: boolean; detail?: string }[], name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (APP_ENV === "production") {
    console.error("Refusing export E2E on production");
    process.exit(1);
  }

  const results: { name: string; pass: boolean; detail?: string }[] = [];
  const superId = process.env.E2E_SUPERADMIN_USER_ID;
  const staffId = process.env.E2E_STAFF_USER_ID;
  const lgId = process.env.E2E_LEADER_GENERAL_USER_ID;
  const foreignMinistry = "00000000-0000-4000-8000-000000000099";

  if (!superId || !staffId || !lgId) {
    console.error("Missing E2E_*_USER_ID — run provision-e2e-users.ts");
    process.exit(1);
  }

  // 1. Superadmin CSV with content or empty message
  try {
    const csv = await exportReportCsv(superId, "persons", {});
    record(
      results,
      "superadmin CSV export",
      typeof csv.csv === "string" && csv.csv.length > 0,
      `rows=${csv.rowCount}`,
    );
    record(results, "CSV encoding has newline headers", csv.csv.includes("\n") || csv.csv.includes(","));
  } catch (e) {
    record(results, "superadmin CSV export", false, String(e));
  }

  // 2. Superadmin XLSX
  try {
    const xlsx = await exportReportXlsx(superId, "persons", {});
    record(
      results,
      "superadmin XLSX export",
      xlsx.buffer.length > 4 && xlsx.buffer[0] === 0x50 && xlsx.buffer[1] === 0x4b,
      xlsx.filename,
    );
    record(results, "XLSX filename convention", xlsx.filename.startsWith("multiplica-"));
  } catch (e) {
    record(results, "superadmin XLSX export", false, String(e));
  }

  // 3. Print/PDF html
  try {
    const print = await exportReportPrintHtml(superId, "persons", {});
    record(
      results,
      "superadmin print HTML",
      print.html.includes("MULTIPLICA") && !/service_role|DATABASE_URL/i.test(print.html),
    );
  } catch (e) {
    record(results, "superadmin print HTML", false, String(e));
  }

  // 4. Staff denied export
  try {
    await exportReportCsv(staffId, "persons", {});
    record(results, "staff export denied", false, "expected throw");
  } catch (e) {
    const ok =
      e instanceof DomainError && e.code === DomainErrorCode.REPORT_EXPORT_DENIED;
    record(results, "staff export denied", ok, (e as Error).message);
  }

  // 5. LG cannot force foreign ministry
  try {
    await exportReportCsv(lgId, "persons", { ministryId: foreignMinistry });
    record(results, "LG foreign ministry blocked", false, "expected throw");
  } catch (e) {
    const ok = e instanceof DomainError;
    record(results, "LG foreign ministry blocked", ok, (e as Error).message);
  }

  // 6. Empty-ish export still succeeds (leadership may be empty for SA)
  try {
    const emptyish = await exportReportCsv(superId, "transfers", {});
    record(
      results,
      "empty-capable export does not throw",
      emptyish.csv.length > 0,
      `rows=${emptyish.rowCount}`,
    );
  } catch (e) {
    record(results, "empty-capable export does not throw", false, String(e));
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nExport E2E: PASS=${results.length - failed} FAIL=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
