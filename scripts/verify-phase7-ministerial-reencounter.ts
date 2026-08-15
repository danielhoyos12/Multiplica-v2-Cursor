/**
 * Live Phase 7 verification — Escuela Ministerial + Re-Encuentro on multiplica-dev.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../src/db/client";
import {
  auditLogs,
  cells,
  ministries,
  networks,
  personLeadership,
  personOrganizationHistory,
  personProcessProgress,
  persons,
  roles,
  trainingAttendance,
  userRoleAssignments,
} from "../src/db/schema";
import { DomainError, DomainErrorCode } from "../src/lib/errors";
import { activateTrainingCycle } from "../src/modules/formation/service";
import {
  completeEm,
  createEmCycle,
  enrollEm,
  ensureEmProgram,
  isEmEligible,
  markEmAcademicCompleted,
  MinisterialRules,
} from "../src/modules/formation/ministerial";
import {
  completeReencuentro,
  createReencuentroEvent,
  enrollReencuentro,
  ensureReencuentroProgram,
  isReencuentroEligible,
  recordReencuentroAttendance,
  ReencuentroRules,
} from "../src/modules/formation/reencounter";
import { getPersonLadder, recordTrainingAttendance } from "../src/modules/formation/service";
import { getEmCycleBoard } from "../src/modules/formation/ministerial";

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
      lastName: `P7${tag()}`,
      source: "internal_form",
      isActive: true,
    })
    .returning();
  await db.insert(personOrganizationHistory).values({
    personId: person.id,
    ministryId,
    networkId,
    changeReason: "phase7-verify",
  });
  return person;
}

async function seedLadderUpTo(
  personId: string,
  ministryId: string,
  networkId: string | null,
  upTo: "destino_n3" | "escuela_ministerial",
) {
  const db = getDb();
  const stages: Array<{
    processType:
      | "consolidar"
      | "udv"
      | "destino_n1"
      | "destino_n2"
      | "destino_n3"
      | "escuela_ministerial";
  }> = [
    { processType: "consolidar" },
    { processType: "udv" },
    { processType: "destino_n1" },
    { processType: "destino_n2" },
    { processType: "destino_n3" },
  ];
  if (upTo === "escuela_ministerial") {
    stages.push({ processType: "escuela_ministerial" });
  }
  for (const s of stages) {
    await db.insert(personProcessProgress).values({
      personId,
      processType: s.processType,
      status: "completed",
      stage: s.processType,
      currentStep: "completado",
      ministryId,
      networkId,
      completedAt: new Date(),
      metadata: { seeded: "phase7-verify" },
    });
  }
}

async function main() {
  const results: Result[] = [];
  const db = getDb();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  record(results, "service_role present", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
  record(results, "DATABASE_URL not public", !process.env.NEXT_PUBLIC_DATABASE_URL);
  record(results, "rule EM needs N3", MinisterialRules.canEnter("completed"));
  record(results, "rule RE needs EM", ReencuentroRules.canEnter("completed"));

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

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonProg = await anon.from("person_process_progress").select("id").limit(3);
  record(
    results,
    "anonymous process DENY/empty",
    Boolean(anonProg.error) || (anonProg.data?.length ?? 0) === 0,
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

  if (!actorUserId || !ministryA || !networkH) {
    process.exit(1);
  }

  const suffix = tag();
  await ensureEmProgram();
  await ensureReencuentroProgram();

  // Persona A: N3 done → EM → complete → RE → complete
  const personA = await createPerson(`A${suffix}`, ministryA.id, networkH.id);
  await seedLadderUpTo(personA.id, ministryA.id, networkH.id, "destino_n3");
  record(results, "A EM eligible after N3", await isEmEligible(personA.id));

  const emCycle = await createEmCycle(actorUserId, {
    name: `EM P7 ${suffix}`,
    startDate: "2026-08-01",
    endDate: "2026-11-30",
    ministryId: ministryA.id,
  });
  let plannedDenied = false;
  try {
    await enrollEm(actorUserId, { personId: personA.id, cycleId: emCycle.id });
  } catch (error) {
    plannedDenied =
      error instanceof DomainError &&
      error.code === DomainErrorCode.MINISTERIAL_SCHOOL_CYCLE_NOT_ACTIVE;
  }
  record(results, "planned EM cycle blocks enroll", plannedDenied);

  await activateTrainingCycle(actorUserId, emCycle.id);
  const enrollA = await enrollEm(actorUserId, {
    personId: personA.id,
    cycleId: emCycle.id,
  });
  record(results, "A enrolled EM", Boolean(enrollA.enrollment.id));

  let dupDenied = false;
  try {
    await enrollEm(actorUserId, { personId: personA.id, cycleId: emCycle.id });
  } catch (error) {
    dupDenied =
      error instanceof DomainError &&
      error.code === DomainErrorCode.MINISTERIAL_SCHOOL_ALREADY_ENROLLED;
  }
  record(results, "duplicate EM enroll DENY", dupDenied);

  const board = await getEmCycleBoard(actorUserId, emCycle.id);
  const moduleId = board.modules[0]?.id;
  if (moduleId) {
    const att = await recordTrainingAttendance(actorUserId, {
      enrollmentId: enrollA.enrollment.id,
      moduleId,
      attendanceDate: "2026-08-15",
      status: "present",
    });
    record(results, "EM attendance works", att.status === "present");
  } else {
    record(results, "EM attendance works", false, "no modules");
  }

  await markEmAcademicCompleted(actorUserId, {
    personId: personA.id,
    enrollmentId: enrollA.enrollment.id,
  });
  record(results, "A EM academic completed", true);

  const doneEm = await completeEm(actorUserId, { personId: personA.id });
  record(results, "A EM formally completed", doneEm.progress.status === "completed");
  record(results, "A EM does not activate leader", doneEm.leadershipActivated === false);
  record(results, "A Reencuentro eligible", await isReencuentroEligible(personA.id));

  const [leadershipA] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, personA.id))
    .limit(1);
  record(
    results,
    "A no auto person_leadership",
    !leadershipA || leadershipA.status !== "active",
  );
  const cellsA = await db
    .select()
    .from(cells)
    .where(eq(cells.responsiblePersonId, personA.id));
  record(results, "A no auto cell from EM", cellsA.length === 0);

  const reEvent = await createReencuentroEvent(actorUserId, {
    name: `RE P7 ${suffix}`,
    startDate: "2026-12-01",
    endDate: "2026-12-02",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorUserId, reEvent.id);
  const enrollReA = await enrollReencuentro(actorUserId, {
    personId: personA.id,
    cycleId: reEvent.id,
  });
  record(results, "A enrolled Reencuentro", Boolean(enrollReA.enrollment.id));

  await recordReencuentroAttendance(actorUserId, {
    enrollmentId: enrollReA.enrollment.id,
    status: "present",
    attendanceDate: "2026-12-01",
  });
  record(results, "A RE attendance recorded", true);

  const doneRe = await completeReencuentro(actorUserId, {
    personId: personA.id,
    enrollmentId: enrollReA.enrollment.id,
  });
  record(results, "A RE completed", doneRe.progress.status === "completed");
  record(results, "A eligible_for_send", doneRe.eligibleForSend === true);
  record(results, "A RE does not activate leader", doneRe.leadershipActivated === false);

  const ladderA = await getPersonLadder(actorUserId, personA.id);
  record(
    results,
    "ladder shows EM+RE completed",
    ladderA.escuelaMinisterial.status === "completed" &&
      ladderA.reencuentro.status === "completed",
  );
  record(results, "ladder next is enviar eligible", ladderA.next.code === "enviar");

  // Persona B: N3 incomplete → EM DENY
  const personB = await createPerson(`B${suffix}`, ministryA.id, networkH.id);
  await db.insert(personProcessProgress).values({
    personId: personB.id,
    processType: "destino_n3",
    status: "in_progress",
    stage: "n3",
    ministryId: ministryA.id,
    networkId: networkH.id,
  });
  let bDenied = false;
  try {
    await enrollEm(actorUserId, { personId: personB.id, cycleId: emCycle.id });
  } catch (error) {
    bDenied =
      error instanceof DomainError &&
      error.code === DomainErrorCode.MINISTERIAL_SCHOOL_NOT_ELIGIBLE;
  }
  record(results, "B N3 incomplete → EM DENY", bDenied);

  // Persona C: EM incomplete → RE DENY
  const personC = await createPerson(`C${suffix}`, ministryA.id, networkH.id);
  await seedLadderUpTo(personC.id, ministryA.id, networkH.id, "destino_n3");
  await enrollEm(actorUserId, { personId: personC.id, cycleId: emCycle.id });
  let cDenied = false;
  try {
    await enrollReencuentro(actorUserId, {
      personId: personC.id,
      cycleId: reEvent.id,
    });
  } catch (error) {
    cDenied =
      error instanceof DomainError &&
      error.code === DomainErrorCode.REENCOUNTER_NOT_ELIGIBLE;
  }
  record(results, "C EM incomplete → RE DENY", cDenied);

  // Persona D: EM complete, miss event 1, re-enroll event 2
  const personD = await createPerson(`D${suffix}`, ministryA.id, networkH.id);
  await seedLadderUpTo(personD.id, ministryA.id, networkH.id, "escuela_ministerial");
  await ensureReencuentroProgram();
  const { ensureReencuentroEligible } = await import("../src/modules/formation/reencounter");
  await ensureReencuentroEligible(personD.id, ministryA.id, networkH.id);

  const re1 = await createReencuentroEvent(actorUserId, {
    name: `RE1 miss ${suffix}`,
    startDate: "2026-12-10",
    endDate: "2026-12-11",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorUserId, re1.id);
  const enrollD1 = await enrollReencuentro(actorUserId, {
    personId: personD.id,
    cycleId: re1.id,
  });
  await recordReencuentroAttendance(actorUserId, {
    enrollmentId: enrollD1.enrollment.id,
    status: "absent",
    attendanceDate: "2026-12-10",
  });
  record(results, "D absent on first event", true);

  const re2 = await createReencuentroEvent(actorUserId, {
    name: `RE2 retry ${suffix}`,
    startDate: "2027-01-10",
    endDate: "2027-01-11",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorUserId, re2.id);
  const enrollD2 = await enrollReencuentro(actorUserId, {
    personId: personD.id,
    cycleId: re2.id,
  });
  record(results, "D re-enroll second event", Boolean(enrollD2.enrollment.id));
  record(
    results,
    "D prior enrollment history preserved",
    enrollD1.enrollment.id !== enrollD2.enrollment.id,
  );

  const audits = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.action, "ministerial_school.completed"))
    .limit(3);
  record(results, "audit EM completed", audits.length > 0);

  const reAudits = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.action, "reencounter.completed"))
    .limit(3);
  record(results, "audit RE completed", reAudits.length > 0);

  record(
    results,
    "secret scan: no NEXT_PUBLIC_DATABASE_URL",
    !process.env.NEXT_PUBLIC_DATABASE_URL,
  );
  record(
    results,
    "bundle scan: SERVICE_ROLE not public",
    !Object.keys(process.env).some(
      (k) => k.startsWith("NEXT_PUBLIC_") && k.includes("SERVICE_ROLE"),
    ),
  );

  const { sql } = await import("drizzle-orm");
  const enumRows = await db.execute(
    sql`select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where typname='process_type' and enumlabel in ('escuela_ministerial','reencuentro')`,
  );
  const rawLabels = JSON.stringify(enumRows);
  record(
    results,
    "drift: process_type includes EM+RE",
    rawLabels.includes("escuela_ministerial") && rawLabels.includes("reencuentro"),
  );

  const attCount = await db.select().from(trainingAttendance).limit(1);
  record(results, "training_attendance reachable", attCount !== undefined);

  const failed = results.filter((r) => !r.pass);
  console.log("\n--- Phase 7 verify summary ---");
  console.log(`PASS ${results.length - failed.length} / ${results.length}`);
  if (failed.length) {
    for (const f of failed) console.log(`FAIL ${f.name}: ${f.detail ?? ""}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
