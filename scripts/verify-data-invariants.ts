/**
 * Data integrity verification against multiplica-dev.
 * Read-only — never auto-repairs. Refuses production targets.
 */
import { assertNotProductionTarget, redactDatabaseUrl } from "../src/lib/prod-guard";
import { runIntegrityChecks } from "../src/modules/reporting/integrity";

async function main() {
  assertNotProductionTarget();
  console.log(`Running integrity checks… target=${redactDatabaseUrl(process.env.DATABASE_URL)}`);
  const report = await runIntegrityChecks();
  console.log(`checkedAt=${report.checkedAt}`);
  console.log(`healthy=${report.healthy}`);
  console.log(`critical=${report.criticalCount} warning=${report.warningCount}`);
  for (const v of report.violations) {
    console.log(
      `${v.severity.toUpperCase()}  ${v.code}  count=${v.count}  samples=${v.sampleIds.join(",")}`,
    );
  }
  // Exit 0 always for informational runs unless CRITICAL_FAIL=1
  if (process.env.CRITICAL_FAIL === "1" && report.criticalCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
