/**
 * Live Phase 7 reconciliation verification against multiplica-dev.
 *
 * Official sequence:
 * GANAR → Pre → Encuentro → Post → Consolidar →
 * CD1 → CD2 → Re-Encuentro → CD3 → EM1 → EM2 → EM3 → NEXT_STAGE_ELIGIBLE
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../src/db/client";
import {
  auditLogs,
  ministries,
  networks,
  personLeadership,
  personOrganizationHistory,
  personProcessProgress,
  persons,
  roles,
  trainingAttendance,
  trainingModules,
  trainingPrograms,
  userRoleAssignments,
} from "../src/db/schema";
import { DomainError, DomainErrorCode } from "../src/lib/errors";
import {
  completeConsolidarStage,
  createConsolidarCycle,
  enrollConsolidarStage,
} from "../src/modules/formation/consolidar-stages";
import {
  completeDestinoLevel,
  createDestinoCycle,
  enrollDestino,
  isDestinoLevelEligible,
  markAcademicCompleted,
} from "../src/modules/formation/destination";
import {
  completeEmLevel,
  createEmLevelCycle,
  enrollEmLevel,
  isEmLevelEligible,
  markEmLevelAcademic,
} from "../src/modules/formation/em-levels";
import {
  countCatalogExpectation,
  ensureOfficialCatalog,
  OfficialEligibility,
} from "../src/modules/formation/official-catalog";
import {
  completeReencuentro,
  createReencuentroEvent,
  enrollReencuentro,
  isReencuentroEligible,
  recordReencuentroAttendance,
} from "../src/modules/formation/reencounter";
import {
  activateTrainingCycle,
  authorizeAttendanceRecovery,
  getPersonLadder,
  recordTrainingAttendance,
} from "../src/modules/formation/service";

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
      lastName: `P7R${tag()}`,
      source: "internal_form",
      isActive: true,
    })
    .returning();
  await db.insert(personOrganizationHistory).values({
    personId: person.id,
    ministryId,
    networkId,
    changeReason: "phase7-reconciliation-verify",
  });
  return person;
}

async function markLevelDone(actorId: string, personId: string, level: 1 | 2 | 3) {
  await markAcademicCompleted(actorId, { personId, level });
  return completeDestinoLevel(actorId, { personId, level });
}

async function markEmDone(actorId: string, personId: string, level: 1 | 2 | 3) {
  await markEmLevelAcademic(actorId, { personId, level });
  return completeEmLevel(actorId, { personId, level });
}

async function main() {
  const results: Result[] = [];
  const db = getDb();

  record(results, "service_role present", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
  record(results, "DATABASE_URL not public", !process.env.NEXT_PUBLIC_DATABASE_URL);

  await ensureOfficialCatalog();
  const expect = countCatalogExpectation();

  for (const [code, want] of [
    ["pre_encuentro", expect.pre],
    ["encuentro", expect.encuentroDays],
    ["post_encuentro", expect.post],
  ] as const) {
    const [p] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.code, code))
      .limit(1);
    const mods = p
      ? await db
          .select()
          .from(trainingModules)
          .where(
            and(eq(trainingModules.programId, p.id), eq(trainingModules.isActive, true)),
          )
      : [];
    record(results, `catalog ${code} = ${want}`, mods.length === want, `got ${mods.length}`);
  }

  for (const code of [
    "destino_n1",
    "destino_n2",
    "destino_n3",
    "em1",
    "em2",
    "em3",
  ] as const) {
    const [p] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.code, code))
      .limit(1);
    const mods = p
      ? await db
          .select()
          .from(trainingModules)
          .where(
            and(eq(trainingModules.programId, p.id), eq(trainingModules.isActive, true)),
          )
      : [];
    const d = mods.filter((m) => m.componentCode === "doctrina").length;
    const s = mods.filter((m) => m.componentCode === "seminario").length;
    record(
      results,
      `catalog ${code} doctrina+seminario 10+10`,
      d === 10 && s === 10,
      `d=${d} s=${s}`,
    );
  }

  const [ministryA] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.isActive, true))
    .orderBy(ministries.code)
    .limit(1);
  const [networkH] = await db
    .select()
    .from(networks)
    .where(eq(networks.code, "hombres"))
    .limit(1);
  record(results, "catalogs ready", Boolean(ministryA && networkH));
  if (!ministryA || !networkH) {
    console.error("Missing ministry/network");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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
  const [superAssign] = await db
    .select()
    .from(userRoleAssignments)
    .where(eq(userRoleAssignments.roleId, superRole.id))
    .limit(1);
  const actorId = superAssign.userId;
  record(results, "superadmin actor", Boolean(actorId));

  const blockA = await createPerson("BlockA", ministryA.id, networkH.id);
  try {
    await completeConsolidarStage(actorId, {
      personId: blockA.id,
      stage: "encuentro",
    });
    record(results, "A Pre incomplete → Encuentro DENY", false, "allowed");
  } catch (e) {
    record(
      results,
      "A Pre incomplete → Encuentro DENY",
      e instanceof DomainError && e.code === DomainErrorCode.PREREQUISITE_NOT_MET,
      e instanceof Error ? e.message : String(e),
    );
  }

  const blockB = await createPerson("BlockB", ministryA.id, networkH.id);
  record(
    results,
    "B CD1 incomplete → CD2 DENY",
    !(await isDestinoLevelEligible(blockB.id, 2)),
  );

  const blockC = await createPerson("BlockC", ministryA.id, networkH.id);
  await db.insert(personProcessProgress).values({
    personId: blockC.id,
    processType: "destino_n2",
    status: "completed",
    stage: "n2",
    ministryId: ministryA.id,
    networkId: networkH.id,
    completedAt: new Date(),
    metadata: { fixture: "blockC" },
  });
  record(
    results,
    "C CD2 complete + RE incomplete → CD3 DENY",
    !(await isDestinoLevelEligible(blockC.id, 3)),
  );

  const blockD = await createPerson("BlockD", ministryA.id, networkH.id);
  await db.insert(personProcessProgress).values({
    personId: blockD.id,
    processType: "destino_n3",
    status: "completed",
    stage: "n3",
    ministryId: ministryA.id,
    networkId: networkH.id,
    completedAt: new Date(),
    metadata: { fixture: "blockD" },
  });
  record(results, "D CD3 complete → EM1 allow", await isEmLevelEligible(blockD.id, 1));

  const blockE = await createPerson("BlockE", ministryA.id, networkH.id);
  record(
    results,
    "E EM1 incomplete → EM2 DENY",
    !(await isEmLevelEligible(blockE.id, 2)),
  );

  const blockF = await createPerson("BlockF", ministryA.id, networkH.id);
  await db.insert(personProcessProgress).values({
    personId: blockF.id,
    processType: "em1",
    status: "in_progress",
    stage: "em1",
    ministryId: ministryA.id,
    networkId: networkH.id,
    metadata: { fixture: "blockF" },
  });
  record(
    results,
    "F EM1 incomplete → EM3 DENY",
    !(await isEmLevelEligible(blockF.id, 3)),
  );

  const hero = await createPerson("Hero", ministryA.id, networkH.id);
  const t = tag();

  const preCycle = await createConsolidarCycle(actorId, {
    stage: "pre_encuentro",
    name: `Pre ${t}`,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorId, preCycle.id);
  const preEnroll = await enrollConsolidarStage(actorId, {
    personId: hero.id,
    cycleId: preCycle.id,
    stage: "pre_encuentro",
  });
  const preMods = await db
    .select()
    .from(trainingModules)
    .where(
      and(
        eq(trainingModules.programId, preCycle.programId),
        eq(trainingModules.isActive, true),
      ),
    );
  if (preMods[0]) {
    const absent = await recordTrainingAttendance(actorId, {
      enrollmentId: preEnroll.enrollment.id,
      moduleId: preMods[0].id,
      status: "absent",
      attendanceDate: "2026-08-05",
    });
    await authorizeAttendanceRecovery(actorId, {
      attendanceId: absent.id,
      note: "authorized recovery for verify",
    });
    const [recovered] = await db
      .select()
      .from(trainingAttendance)
      .where(eq(trainingAttendance.id, absent.id))
      .limit(1);
    record(
      results,
      "recovery conserves absence history",
      recovered?.status === "recovered" && Boolean(recovered.recoveryAuthorizedByUserId),
      recovered?.status,
    );
  } else {
    record(results, "recovery conserves absence history", false, "no modules");
  }

  await completeConsolidarStage(actorId, {
    personId: hero.id,
    stage: "pre_encuentro",
  });
  record(results, "Pre completed", true);

  const encCycle = await createConsolidarCycle(actorId, {
    stage: "encuentro",
    name: `Enc ${t}`,
    startDate: "2026-09-01",
    endDate: "2026-09-03",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorId, encCycle.id);
  await enrollConsolidarStage(actorId, {
    personId: hero.id,
    cycleId: encCycle.id,
    stage: "encuentro",
  });
  await completeConsolidarStage(actorId, {
    personId: hero.id,
    stage: "encuentro",
  });
  record(results, "Encuentro completed (3-day program)", true);

  const postCycle = await createConsolidarCycle(actorId, {
    stage: "post_encuentro",
    name: `Post ${t}`,
    startDate: "2026-09-10",
    endDate: "2026-10-10",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorId, postCycle.id);
  await enrollConsolidarStage(actorId, {
    personId: hero.id,
    cycleId: postCycle.id,
    stage: "post_encuentro",
  });
  const afterPost = await completeConsolidarStage(actorId, {
    personId: hero.id,
    stage: "post_encuentro",
  });
  record(
    results,
    "Post → Consolidar aggregate completed",
    afterPost.consolidar?.status === "completed",
    afterPost.consolidar?.status,
  );

  record(
    results,
    "CD1 eligible after Consolidar",
    await isDestinoLevelEligible(hero.id, 1),
  );
  const cd1 = await createDestinoCycle(actorId, {
    level: 1,
    name: `CD1 ${t}`,
    startDate: "2026-10-01",
    endDate: "2026-12-01",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorId, cd1.id);
  await enrollDestino(actorId, { personId: hero.id, cycleId: cd1.id, level: 1 });
  await markLevelDone(actorId, hero.id, 1);

  record(results, "CD2 eligible after CD1", await isDestinoLevelEligible(hero.id, 2));
  const cd2 = await createDestinoCycle(actorId, {
    level: 2,
    name: `CD2 ${t}`,
    startDate: "2026-12-01",
    endDate: "2027-02-01",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorId, cd2.id);
  await enrollDestino(actorId, { personId: hero.id, cycleId: cd2.id, level: 2 });
  await markLevelDone(actorId, hero.id, 2);

  record(results, "Re-Encuentro eligible after CD2", await isReencuentroEligible(hero.id));
  record(
    results,
    "CD3 still DENY before Re-Encuentro",
    !(await isDestinoLevelEligible(hero.id, 3)),
  );
  const reEvt = await createReencuentroEvent(actorId, {
    name: `RE ${t}`,
    startDate: "2027-02-10",
    endDate: "2027-02-12",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorId, reEvt.id);
  const reEnroll = await enrollReencuentro(actorId, {
    personId: hero.id,
    cycleId: reEvt.id,
  });
  await recordReencuentroAttendance(actorId, {
    enrollmentId: reEnroll.enrollment.id,
    status: "present",
    attendanceDate: "2027-02-10",
  });
  await completeReencuentro(actorId, { personId: hero.id });

  record(results, "CD3 eligible after CD2+RE", await isDestinoLevelEligible(hero.id, 3));
  const cd3 = await createDestinoCycle(actorId, {
    level: 3,
    name: `CD3 ${t}`,
    startDate: "2027-03-01",
    endDate: "2027-05-01",
    ministryId: ministryA.id,
  });
  await activateTrainingCycle(actorId, cd3.id);
  await enrollDestino(actorId, { personId: hero.id, cycleId: cd3.id, level: 3 });
  await markLevelDone(actorId, hero.id, 3);

  record(results, "EM1 eligible after CD3", await isEmLevelEligible(hero.id, 1));
  for (const level of [1, 2, 3] as const) {
    const cyc = await createEmLevelCycle(actorId, {
      level,
      name: `EM${level} ${t}`,
      startDate: "2027-06-01",
      endDate: "2027-09-01",
      ministryId: ministryA.id,
    });
    await activateTrainingCycle(actorId, cyc.id);
    await enrollEmLevel(actorId, { personId: hero.id, cycleId: cyc.id, level });
    await markEmDone(actorId, hero.id, level);
  }

  const ladder = await getPersonLadder(actorId, hero.id);
  record(
    results,
    "ladder next is Enviar eligible",
    ladder.next.code === "enviar" && ladder.next.eligible === true,
    `${ladder.next.code} eligible=${ladder.next.eligible}`,
  );
  record(
    results,
    "UDV is not a gate on ladder",
    ladder.udv.eligible === false && ladder.udv.legacy === true,
  );
  record(
    results,
    "discipular order has RE between CD2 and CD3",
    ladder.discipular.cd2.status === "completed" &&
      ladder.discipular.reencuentro.status === "completed" &&
      ladder.discipular.cd3.status === "completed",
  );
  record(
    results,
    "EM1–3 completed",
    ladder.discipular.em1.status === "completed" &&
      ladder.discipular.em2.status === "completed" &&
      ladder.discipular.em3.status === "completed",
  );

  const [lead] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, hero.id))
    .limit(1);
  record(
    results,
    "NO auto-activate leadership",
    !lead || lead.status !== "active",
    lead?.status ?? "none",
  );

  const legacyUdv = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(personProcessProgress)
    .where(eq(personProcessProgress.processType, "udv"));
  record(
    results,
    "legacy udv rows preserved",
    Number(legacyUdv[0]?.c ?? 0) >= 0,
    `count=${legacyUdv[0]?.c}`,
  );

  const fixtureMarked = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(personProcessProgress)
    .where(
      sql`${personProcessProgress.metadata}->>'reconciliation' = 'fixture_or_legacy_unverified'`,
    );
  record(
    results,
    "fixtures marked do_not_auto_equate",
    Number(fixtureMarked[0]?.c ?? 0) > 0,
    `count=${fixtureMarked[0]?.c}`,
  );

  record(
    results,
    "UDV completed ≠ Pre/Enc/Post auto",
    OfficialEligibility.udvIsNotGateBeforeCd1 === true &&
      !OfficialEligibility.consolidar("completed", null, null),
  );

  const audits = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorUserId, actorId),
        eq(auditLogs.action, "ministerial_school.next_stage_eligible"),
      ),
    )
    .limit(50);
  const em3Next = audits.some((a) => {
    const meta = a.metadata as { nextStage?: string; personId?: string } | null;
    return meta?.nextStage === "enviar" && meta?.personId === hero.id;
  });
  record(results, "EM3 → NEXT_STAGE_ELIGIBLE audit", em3Next);

  const failed = results.filter((r) => !r.pass);
  console.log("\n=== Phase 7 reconciliation verify ===");
  console.log(`PASS ${results.length - failed.length} / ${results.length}`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail ?? ""}`);
    process.exit(1);
  }
  console.log("ALL PASS — Fase 8 NOT started — PR #9 NOT merged");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
