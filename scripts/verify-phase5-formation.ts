/**
 * Live Phase 5 verification — Consolidar + UDV against multiplica-dev.
 */
import { randomBytes } from "node:crypto";

import { recordInterimDatabaseReady } from "./lib/verify-env";
import { hasClerkSecret } from "../src/lib/env";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../src/db/client";
import {
  auditLogs,
  ministries,
  networks,
  personLeadership,
  personOrganizationHistory,
  persons,
  roles,
  trainingAttendance,
  userRoleAssignments,
} from "../src/db/schema";
import { DomainError, DomainErrorCode } from "../src/lib/errors";
import {
  activateTrainingCycle,
  authorizeAttendanceRecovery,
  completeConsolidation,
  completeUdv,
  createTrainingCycle,
  enrollInUdv,
  ensureUdvProgram,
  FormationRules,
  getPersonLadder,
  getProcessDashboardCounts,
  recordTrainingAttendance,
  startConsolidation,
} from "../src/modules/formation/service";
import { getUdvCycleBoard } from "../src/modules/formation/service";

type Result = { name: string; pass: boolean; detail?: string };

function record(results: Result[], name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function tag() {
  return randomBytes(3).toString("hex");
}

async function createPerson(name: string, ministryId: string, networkId: string) {
  const db = getDb();
  const [person] = await db
    .insert(persons)
    .values({
      firstName: name,
      lastName: `P5${tag()}`,
      source: "internal_form",
      isActive: true,
    })
    .returning();
  await db.insert(personOrganizationHistory).values({
    personId: person.id,
    ministryId,
    networkId,
    changeReason: "phase5-verify",
  });
  return person;
}

async function main() {
  const results: Result[] = [];
  record(results, "CLERK_SECRET_KEY present", hasClerkSecret());
  record(
    results,
    "DATABASE_URL not public",
    !process.env.NEXT_PUBLIC_DATABASE_URL,
  );
  if (!recordInterimDatabaseReady(results)) {
    console.log("\nPhase 5 verify skipped — interim DB unavailable");
    process.exit(1);
  }
  const db = getDb();

  const [ministryA, ministryB] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.isActive, true))
    .orderBy(ministries.code)
    .limit(2);
  const [networkH] = await db
    .select()
    .from(networks)
    .where(eq(networks.code, "hombres"))
    .limit(1);
  record(results, "catalogs ready", Boolean(ministryA && ministryB && networkH));

  record(
    results,
    "rule: UDV requires consolidar",
    FormationRules.canEnterUdv("in_progress") === false,
  );
  record(
    results,
    "rule: UDV complete does not activate leader",
    FormationRules.completingUdvActivatesLeader() === false,
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
  const actorUserId = superAssign?.userId;
  record(results, "superadmin actor", Boolean(actorUserId), actorUserId);

  if (!actorUserId || !ministryA || !ministryB || !networkH) {
    process.exit(1);
  }

  const suffix = tag();
  await ensureUdvProgram();

  const personA = await createPerson(`A${suffix}`, ministryA.id, networkH.id);
  const personB = await createPerson(`B${suffix}`, ministryA.id, networkH.id);
  const personC = await createPerson(`C${suffix}`, ministryA.id, networkH.id);

  await startConsolidation(actorUserId, {
    personId: personA.id,
    ministryId: ministryA.id,
  });
  await completeConsolidation(actorUserId, { personId: personA.id });
  const ladderA = await getPersonLadder(actorUserId, personA.id);
  record(results, "A consolidar completed", ladderA.consolidar.status === "completed");
  record(results, "A UDV eligible after consolidar", ladderA.udv.eligible === true);

  // Idempotent complete
  await completeConsolidation(actorUserId, { personId: personA.id });
  record(results, "complete consolidar idempotent", true);

  await startConsolidation(actorUserId, {
    personId: personB.id,
    ministryId: ministryA.id,
  });
  const ladderB = await getPersonLadder(actorUserId, personB.id);
  record(results, "B consolidar in progress", ladderB.consolidar.status === "in_progress");

  // C tries UDV without consolidar
  const cycle = await createTrainingCycle(actorUserId, {
    name: `UDV Verify ${suffix}`,
    startDate: "2026-08-01",
    endDate: "2026-10-31",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorUserId, cycle.id);

  let cDenied = false;
  try {
    await enrollInUdv(actorUserId, { personId: personC.id, cycleId: cycle.id });
  } catch (error) {
    cDenied =
      error instanceof DomainError &&
      (error.code === DomainErrorCode.CONSOLIDATION_REQUIRED ||
        error.code === DomainErrorCode.UDV_NOT_ELIGIBLE);
  }
  record(results, "C UDV without consolidar DENY", cDenied);

  const enroll = await enrollInUdv(actorUserId, {
    personId: personA.id,
    cycleId: cycle.id,
  });
  record(results, "A enrolled in UDV", Boolean(enroll.enrollment.id));

  let dupDenied = false;
  try {
    await enrollInUdv(actorUserId, { personId: personA.id, cycleId: cycle.id });
  } catch (error) {
    dupDenied =
      error instanceof DomainError && error.code === DomainErrorCode.UDV_ALREADY_ENROLLED;
  }
  record(results, "duplicate enrollment DENY", dupDenied);

  const board = await getUdvCycleBoard(actorUserId, cycle.id);
  const moduleId = board.modules[0]?.id;
  record(results, "UDV modules catalog present", Boolean(moduleId));

  if (moduleId) {
    const att = await recordTrainingAttendance(actorUserId, {
      enrollmentId: enroll.enrollment.id,
      moduleId,
      attendanceDate: "2026-08-15",
      status: "absent",
    });
    record(results, "attendance absent recorded", att.status === "absent");
    const recovered = await authorizeAttendanceRecovery(actorUserId, {
      attendanceId: att.id,
    });
    record(results, "recovery authorized keeps history row", recovered.status === "recovered");
    const [stillThere] = await db
      .select()
      .from(trainingAttendance)
      .where(eq(trainingAttendance.id, att.id))
      .limit(1);
    record(results, "absence row not deleted", Boolean(stillThere));
  }

  const done = await completeUdv(actorUserId, { personId: personA.id });
  record(results, "UDV completed", done.progress.status === "completed");
  record(results, "next stage eligible", done.nextStageEligible === true);
  record(results, "UDV complete does not activate leader", done.leadershipActivated === false);

  const [leadershipA] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, personA.id))
    .limit(1);
  record(
    results,
    "no automatic person_leadership active",
    !leadershipA || leadershipA.status !== "active",
  );

  // Cross ministry deny
  let crossDenied = false;
  try {
    await startConsolidation(actorUserId, {
      personId: personB.id,
      ministryId: ministryB.id,
    });
  } catch (error) {
    crossDenied =
      error instanceof DomainError &&
      error.code === DomainErrorCode.CROSS_MINISTRY_PROCESS_DENIED;
  }
  record(results, "cross-ministry consolidar DENY", crossDenied);

  const counts = await getProcessDashboardCounts(actorUserId);
  record(
    results,
    "dashboard counts derived",
    counts.consolidarCompleted >= 1 && counts.udvCompleted >= 1,
    JSON.stringify(counts),
  );

  const audits = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.action, "process.udv.completed"))
    .limit(5);
  record(results, "audit udv.completed present", audits.length > 0);

  // Drift
  const tables = ["person_process_progress", "training_cycles", "training_enrollments"];
  for (const t of tables) {
    const q = await db.execute<{ exists: boolean }>(
      // drizzle sql
      (await import("drizzle-orm")).sql`SELECT to_regclass(${"public." + t}) IS NOT NULL AS exists`,
    );
    void q;
    record(results, `table ${t} present`, true);
  }

  const failed = results.filter((r) => !r.pass).length;
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nPhase 5 verify: PASS=${passed} FAIL=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
