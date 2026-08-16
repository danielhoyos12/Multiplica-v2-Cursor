/**
 * Phase 1 org services smoke — Clerk + interim Drizzle (non-Supabase).
 * Run: npx tsx --env-file=.env.local scripts/verify-phase1-services.ts
 */
import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "../src/db/client";
import { auditLogs, roles, userRoleAssignments, users } from "../src/db/schema";
import {
  assignMinistryResponsible,
  createMinistry,
  listMinistriesForActor,
  setMinistryActive,
  updateMinistry,
} from "../src/modules/organization/service";
import {
  record,
  recordInterimDatabaseReady,
  type CheckResult,
} from "./lib/verify-env";
import { hasClerkSecret } from "../src/lib/env";

async function main() {
  const results: CheckResult[] = [];
  record(results, "CLERK_SECRET_KEY present", hasClerkSecret());
  if (!recordInterimDatabaseReady(results)) {
    console.log("\nPhase 1 verify skipped — interim DB unavailable");
    process.exit(1);
  }

  const db = getDb();
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
  const actorUserId = superAssign?.userId;
  record(results, "superadmin actor present", Boolean(actorUserId), actorUserId ?? "none");
  if (!actorUserId) {
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\nPhase 1 verify: FAIL=${failed} (no superadmin in app DB)`);
    process.exit(1);
  }

  const [actor] = await db.select().from(users).where(eq(users.id, actorUserId)).limit(1);
  record(results, "superadmin has clerk_user_id", Boolean(actor?.clerkUserId), actor?.clerkUserId ?? "null");

  const created = await createMinistry(actorUserId, {
    code: "LP3",
    name: "Ministerio Servicio",
    sortOrder: 3,
    isActive: true,
  });
  const updated = await updateMinistry(actorUserId, created.id, {
    name: "Ministerio Servicio Editado",
  });
  await setMinistryActive(actorUserId, created.id, false);
  await setMinistryActive(actorUserId, created.id, true);
  await assignMinistryResponsible(actorUserId, created.id, actorUserId);
  const listed = await listMinistriesForActor(actorUserId);
  const audits = await db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.entityId, created.id))
    .orderBy(desc(auditLogs.createdAt));

  record(results, "createMinistry LP3", created.code === "LP3");
  record(results, "updateMinistry name", updated.name === "Ministerio Servicio Editado");
  record(results, "listMinistries includes LP3", listed.some((m) => m.code === "LP3"));
  record(results, "audit trail present", audits.length > 0, audits.map((a) => a.action).join(","));

  console.log(
    JSON.stringify(
      {
        createdCode: created.code,
        updatedName: updated.name,
        listedHasLP3: listed.some((m) => m.code === "LP3"),
        auditActions: audits.map((a) => a.action),
      },
      null,
      2,
    ),
  );

  const failed = results.filter((r) => !r.pass).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
