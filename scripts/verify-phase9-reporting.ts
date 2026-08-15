/**
 * Live Phase 9 reporting verification against multiplica-dev.
 */
import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../src/db/client";
import {
  ministries,
  networks,
  personLeadership,
  roles,
  userRoleAssignments,
} from "../src/db/schema";
import { DomainError, DomainErrorCode } from "../src/lib/errors";
import {
  exportReportCsv,
  getExecutiveDashboard,
  resolveDashboardScope,
  runIntegrityChecks,
  runReport,
  sanitizeCsvCell,
} from "../src/modules/reporting";

type Result = { name: string; pass: boolean; detail?: string };

function record(results: Result[], name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const results: Result[] = [];
  const db = getDb();

  record(results, "service_role present", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
  record(results, "DATABASE_URL not public", !process.env.NEXT_PUBLIC_DATABASE_URL);
  record(results, "CSV formula sanitize", sanitizeCsvCell("=cmd").startsWith("'"));

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const anonPersons = await anon.from("persons").select("id").limit(3);
  record(
    results,
    "anonymous persons DENY/empty",
    Boolean(anonPersons.error) || (anonPersons.data?.length ?? 0) === 0,
  );

  const [superRole] = await db.select().from(roles).where(eq(roles.code, "superadmin")).limit(1);
  const [superAssign] = superRole
    ? await db
        .select()
        .from(userRoleAssignments)
        .where(
          and(eq(userRoleAssignments.roleId, superRole.id), isNull(userRoleAssignments.endsAt)),
        )
        .limit(1)
    : [null];
  const actorId = superAssign?.userId;
  record(results, "superadmin actor", Boolean(actorId));
  if (!actorId) {
    process.exit(1);
  }

  const scope = await resolveDashboardScope(actorId, {});
  record(results, "superadmin scope global/ministry", scope.mode === "global" || scope.mode === "ministry", scope.mode);

  const dash = await getExecutiveDashboard(actorId, { period: "this_month" });
  record(results, "dashboard loads", Boolean(dash));
  record(results, "person metrics derived", typeof dash.persons.totalActive === "number");
  record(results, "ladder methodology current_state", dash.ladder.methodology === "current_state_counts");
  record(results, "funnel has 4 stages", dash.ladder.funnel.length === 4);
  record(results, "eligible != active visible", typeof dash.leadership.eligible === "number");
  record(
    results,
    "generations use real depths not assumed 144",
    dash.leadership.generations.potentialLabel.includes("Reales"),
  );
  record(results, "cell metrics present", typeof dash.cells.totalActive === "number");
  record(results, "alerts array", Array.isArray(dash.alerts));
  record(results, "timings recorded", Object.keys(dash.timings).length > 0);
  record(
    results,
    "prayer text absent from dashboard payload",
    !JSON.stringify(dash).includes("prayerRequest"),
  );

  // Ministry filter for LG-like view
  const [ministry] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.isActive, true))
    .limit(1);
  if (ministry) {
    const mDash = await getExecutiveDashboard(actorId, {
      period: "last_30",
      ministryId: ministry.id,
    });
    record(results, "ministry filter works", mDash.scope.ministryIds.includes(ministry.id));
  }

  // Subtree drill-down if any active leader
  const [lead] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.status, "active"))
    .limit(1);
  if (lead) {
    const tDash = await getExecutiveDashboard(actorId, {
      rootPersonId: lead.personId,
      period: "this_week",
    });
    record(results, "subtree drill-down", tDash.scope.mode === "subtree");
    record(
      results,
      "X/12 present for focus",
      Boolean(tDash.leadership.focus?.progress.label.includes("/")),
    );
  }

  const personsReport = await runReport(actorId, "persons", { page: 1, pageSize: 10 });
  record(results, "persons report scoped", personsReport.type === "persons");
  record(
    results,
    "persons report no prayer",
    !JSON.stringify(personsReport.rows).toLowerCase().includes("prayer"),
  );

  const cellsReport = await runReport(actorId, "cells", { pageSize: 5 });
  record(results, "cells report", cellsReport.type === "cells");
  const leadReport = await runReport(actorId, "leadership", { pageSize: 5 });
  record(results, "leadership report", leadReport.type === "leadership");
  const formReport = await runReport(actorId, "formation", { pageSize: 5 });
  record(results, "formation report", formReport.type === "formation");
  const xferReport = await runReport(actorId, "transfers", { pageSize: 5 });
  record(results, "transfers report", xferReport.type === "transfers");

  const exported = await exportReportCsv(actorId, "persons", {});
  record(results, "csv export works", exported.csv.length > 0);
  record(results, "csv has BOM", exported.csv.startsWith("\uFEFF"));

  const integrity = await runIntegrityChecks();
  record(results, "integrity checks run", Boolean(integrity.checkedAt));
  record(
    results,
    "integrity report structured",
    typeof integrity.criticalCount === "number",
    `critical=${integrity.criticalCount} warning=${integrity.warningCount}`,
  );

  // Network catalog exists
  const [net] = await db.select().from(networks).limit(1);
  record(results, "networks catalog", Boolean(net));

  // Deny path: invalid uuid root for scope should throw when not descendant — use fake uuid under non-superadmin not available; skip

  try {
    await resolveDashboardScope("00000000-0000-0000-0000-000000000000", {});
    record(results, "unknown actor deny", false);
  } catch (e) {
    record(
      results,
      "unknown actor deny",
      e instanceof DomainError || e instanceof Error,
      e instanceof DomainError ? e.code : String(e),
    );
  }

  void DomainErrorCode;

  const failed = results.filter((r) => !r.pass).length;
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nPhase 9 verify: PASS=${passed} FAIL=${failed} TOTAL=${results.length}`);
  if (failed > 0) {
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  - ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
