/**
 * Consolidar stages: Pre-Encuentro → Encuentro → Post-Encuentro.
 * Aggregate consolidar.completed syncs when all three are completed.
 */
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  ENCUENTRO_CODE,
  POST_ENCUENTRO_CODE,
  PRE_ENCUENTRO_CODE,
  personOrganizationHistory,
  personProcessEvents,
  personProcessProgress,
  persons,
  trainingAttendance,
  trainingCycles,
  trainingEnrollments,
  trainingModules,
  trainingPrograms,
} from "@/db/schema";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { writeAuditLog } from "@/modules/audit";
import {
  assertCanMutate,
  hasPermission,
  isLeaderGeneral,
  isSuperadmin,
  loadAuthContext,
} from "@/modules/authorization";
import { formatFullName } from "@/modules/ganar/normalize";
import { assertProcessAccess, statusLabel } from "@/modules/formation/service";
import {
  OfficialEligibility,
  ensureOfficialCatalog,
} from "@/modules/formation/official-catalog";

export type ConsolidarStage = "pre_encuentro" | "encuentro" | "post_encuentro";

const STAGE_CODE: Record<ConsolidarStage, string> = {
  pre_encuentro: PRE_ENCUENTRO_CODE,
  encuentro: ENCUENTRO_CODE,
  post_encuentro: POST_ENCUENTRO_CODE,
};

async function requireActor(userId: string) {
  return loadAuthContext(userId);
}

async function currentOrg(personId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      ministryId: personOrganizationHistory.ministryId,
      networkId: personOrganizationHistory.networkId,
    })
    .from(personOrganizationHistory)
    .where(
      and(
        eq(personOrganizationHistory.personId, personId),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getStageProgress(personId: string, stage: ConsolidarStage) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, stage),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getConsolidarAggregate(personId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, "consolidar"),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function appendStageEvent(params: {
  progressId: string;
  personId: string;
  processType: ConsolidarStage;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(personProcessEvents).values({
    progressId: params.progressId,
    personId: params.personId,
    processType: params.processType,
    eventType: params.eventType,
    fromStatus: (params.fromStatus as never) ?? null,
    toStatus: (params.toStatus as never) ?? null,
    actorUserId: params.actorUserId,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
  });
}

export async function assertStageEligible(personId: string, stage: ConsolidarStage) {
  if (stage === "pre_encuentro") return;
  if (stage === "encuentro") {
    const pre = await getStageProgress(personId, "pre_encuentro");
    if (!OfficialEligibility.encuentro(pre?.status ?? null)) {
      throw new DomainError(
        DomainErrorCode.PREREQUISITE_NOT_MET,
        "Pre-Encuentro debe estar completado.",
      );
    }
    return;
  }
  const enc = await getStageProgress(personId, "encuentro");
  if (!OfficialEligibility.postEncuentro(enc?.status ?? null)) {
    throw new DomainError(
      DomainErrorCode.PREREQUISITE_NOT_MET,
      "Encuentro debe estar completado.",
    );
  }
}

/** Sync consolidar aggregate from Pre+Encuentro+Post. Idempotent. */
export async function syncConsolidarAggregate(
  personId: string,
  actorUserId: string | null,
) {
  const pre = await getStageProgress(personId, "pre_encuentro");
  const enc = await getStageProgress(personId, "encuentro");
  const post = await getStageProgress(personId, "post_encuentro");
  const complete = OfficialEligibility.consolidar(
    pre?.status ?? null,
    enc?.status ?? null,
    post?.status ?? null,
  );
  if (!complete) return null;

  const org = await currentOrg(personId);
  if (!org?.ministryId) return null;

  const existing = await getConsolidarAggregate(personId);
  const db = getDb();
  if (existing?.status === "completed") {
    const { ensureDestinoN1Eligible } = await import("./destination");
    await ensureDestinoN1Eligible(personId, org.ministryId, org.networkId);
    return existing;
  }

  let row;
  if (!existing) {
    [row] = await db
      .insert(personProcessProgress)
      .values({
        personId,
        processType: "consolidar",
        status: "completed",
        stage: "consolidar",
        currentStep: "completado",
        ministryId: org.ministryId,
        networkId: org.networkId,
        completedAt: new Date(),
        completedByUserId: actorUserId,
        metadata: {
          derived_from: ["pre_encuentro", "encuentro", "post_encuentro"],
          sync: "phase7-reconciliation",
        },
      })
      .returning();
    if (actorUserId) {
      await writeAuditLog({
        actorUserId,
        action: "process.consolidar.completed",
        entityType: "person_process_progress",
        entityId: row.id,
        metadata: { personId, derived: true },
      });
      await db.insert(personProcessEvents).values({
        progressId: row.id,
        personId,
        processType: "consolidar",
        eventType: "completed",
        fromStatus: null,
        toStatus: "completed",
        actorUserId,
        metadata: { derived: true },
      });
    }
  } else {
    [row] = await db
      .update(personProcessProgress)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedByUserId: actorUserId,
        currentStep: "completado",
        updatedAt: new Date(),
        metadata: {
          ...(existing.metadata ?? {}),
          derived_from: ["pre_encuentro", "encuentro", "post_encuentro"],
          sync: "phase7-reconciliation",
        },
      })
      .where(eq(personProcessProgress.id, existing.id))
      .returning();

    await db.insert(personProcessEvents).values({
      progressId: row.id,
      personId,
      processType: "consolidar",
      eventType: "completed",
      fromStatus: existing.status,
      toStatus: "completed",
      actorUserId,
      metadata: { derived: true },
    });
    if (actorUserId) {
      await writeAuditLog({
        actorUserId,
        action: "process.consolidar.completed",
        entityType: "person_process_progress",
        entityId: row.id,
        metadata: { personId, derived: true },
      });
    }
  }

  const { ensureDestinoN1Eligible } = await import("./destination");
  await ensureDestinoN1Eligible(personId, org.ministryId, org.networkId);
  return row;
}

export async function createConsolidarCycle(
  actorUserId: string,
  raw: {
    stage: ConsolidarStage;
    name: string;
    startDate: string;
    endDate: string;
    ministryId?: string | null;
  },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "school.cycles.manage", {
    type: "training",
    ministryId: raw.ministryId ?? undefined,
  });
  await ensureOfficialCatalog();
  const db = getDb();
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.code, STAGE_CODE[raw.stage]))
    .limit(1);
  if (!program) {
    throw new DomainError(DomainErrorCode.CONFIGURATION_ERROR, "Programa no configurado.");
  }
  const [cycle] = await db
    .insert(trainingCycles)
    .values({
      programId: program.id,
      name: raw.name.trim(),
      startDate: raw.startDate,
      endDate: raw.endDate,
      status: "planned",
      ministryId: raw.ministryId || null,
      createdByUserId: actorUserId,
    })
    .returning();
  return cycle;
}

export async function enrollConsolidarStage(
  actorUserId: string,
  raw: { personId: string; cycleId: string; stage: ConsolidarStage },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "consolidation.manage", {
    type: "process",
    personId: raw.personId,
  });
  await assertStageEligible(raw.personId, raw.stage);
  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia.");
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);
  await ensureOfficialCatalog();

  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, raw.cycleId))
    .limit(1);
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.CYCLE_ALREADY_CLOSED,
      "Solo ciclos activos admiten inscripción.",
    );
  }
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.id, cycle.programId))
    .limit(1);
  if (!program || program.code !== STAGE_CODE[raw.stage]) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Ciclo no corresponde a la etapa.");
  }

  const progress = await getStageProgress(raw.personId, raw.stage);
  if (progress?.status === "completed") {
    throw new DomainError(
      DomainErrorCode.CONSOLIDATION_ALREADY_COMPLETED,
      "Etapa ya completada.",
    );
  }

  const [existing] = await db
    .select()
    .from(trainingEnrollments)
    .where(
      and(
        eq(trainingEnrollments.cycleId, raw.cycleId),
        eq(trainingEnrollments.personId, raw.personId),
      ),
    )
    .limit(1);
  if (existing) {
    throw new DomainError(DomainErrorCode.CONFLICT, "Ya inscrito en este ciclo.");
  }

  const [enrollment] = await db
    .insert(trainingEnrollments)
    .values({ cycleId: raw.cycleId, personId: raw.personId, status: "in_progress" })
    .returning();

  let updated = progress;
  if (!updated) {
    const [created] = await db
      .insert(personProcessProgress)
      .values({
        personId: raw.personId,
        processType: raw.stage,
        status: "in_progress",
        stage: raw.stage,
        currentStep: "cursando",
        ministryId: org.ministryId,
        networkId: org.networkId,
        startedAt: new Date(),
        metadata: { cycleId: cycle.id },
      })
      .returning();
    updated = created;
  } else {
    const [row] = await db
      .update(personProcessProgress)
      .set({
        status: "in_progress",
        currentStep: "cursando",
        updatedAt: new Date(),
        metadata: { ...(updated.metadata ?? {}), cycleId: cycle.id },
      })
      .where(eq(personProcessProgress.id, updated.id))
      .returning();
    updated = row;
  }

  await appendStageEvent({
    progressId: updated.id,
    personId: raw.personId,
    processType: raw.stage,
    eventType: "enrolled",
    fromStatus: progress?.status ?? null,
    toStatus: "in_progress",
    actorUserId,
    metadata: { cycleId: cycle.id, enrollmentId: enrollment.id },
  });
  return { enrollment, progress: updated };
}

export async function completeConsolidarStage(
  actorUserId: string,
  raw: { personId: string; stage: ConsolidarStage; note?: string },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "consolidation.manage", {
    type: "process",
    personId: raw.personId,
  });
  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia.");
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);
  await assertStageEligible(raw.personId, raw.stage);

  let progress = await getStageProgress(raw.personId, raw.stage);
  const db = getDb();
  if (!progress) {
    const [created] = await db
      .insert(personProcessProgress)
      .values({
        personId: raw.personId,
        processType: raw.stage,
        status: "completed",
        stage: raw.stage,
        currentStep: "completado",
        ministryId: org.ministryId,
        networkId: org.networkId,
        startedAt: new Date(),
        completedAt: new Date(),
        completedByUserId: actorUserId,
        metadata: {},
      })
      .returning();
    progress = created;
  } else if (progress.status !== "completed") {
    const [row] = await db
      .update(personProcessProgress)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedByUserId: actorUserId,
        currentStep: "completado",
        updatedAt: new Date(),
      })
      .where(eq(personProcessProgress.id, progress.id))
      .returning();
    progress = row;
  }

  await appendStageEvent({
    progressId: progress.id,
    personId: raw.personId,
    processType: raw.stage,
    eventType: "completed",
    toStatus: "completed",
    actorUserId,
    note: raw.note,
  });
  await writeAuditLog({
    actorUserId,
    action: `process.${raw.stage}.completed`,
    entityType: "person_process_progress",
    entityId: progress.id,
    metadata: { personId: raw.personId, leadership_activated: false },
  });

  const consolidar = await syncConsolidarAggregate(raw.personId, actorUserId);
  return { progress, consolidar, leadershipActivated: false };
}

export async function getConsolidarDashboardCounts(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const types: ConsolidarStage[] = ["pre_encuentro", "encuentro", "post_encuentro"];
  const conditions = [inArray(personProcessProgress.processType, types)];
  if (!isSuperadmin(actor) && actor.ministryIds.length) {
    conditions.push(inArray(personProcessProgress.ministryId, actor.ministryIds));
  }
  const rows = await db
    .select({
      processType: personProcessProgress.processType,
      status: personProcessProgress.status,
      c: count(),
    })
    .from(personProcessProgress)
    .where(and(...conditions))
    .groupBy(personProcessProgress.processType, personProcessProgress.status);

  const pick = (type: string, statuses: string[]) =>
    rows
      .filter((r) => r.processType === type && statuses.includes(r.status))
      .reduce((a, r) => a + Number(r.c), 0);

  return {
    preInProgress: pick("pre_encuentro", ["in_progress", "eligible", "pending"]),
    preCompleted: pick("pre_encuentro", ["completed"]),
    encuentroInProgress: pick("encuentro", ["in_progress", "eligible", "pending"]),
    encuentroCompleted: pick("encuentro", ["completed"]),
    postInProgress: pick("post_encuentro", ["in_progress", "eligible", "pending"]),
    postCompleted: pick("post_encuentro", ["completed"]),
  };
}

export async function getPersonConsolidarSummary(personId: string) {
  const pre = await getStageProgress(personId, "pre_encuentro");
  const enc = await getStageProgress(personId, "encuentro");
  const post = await getStageProgress(personId, "post_encuentro");
  const agg = await getConsolidarAggregate(personId);
  return {
    pre: {
      status: pre?.status ?? "pending",
      label: statusLabel(pre?.status ?? "pending"),
    },
    encuentro: {
      status: enc?.status ?? "pending",
      label: statusLabel(enc?.status ?? "pending"),
    },
    post: {
      status: post?.status ?? "pending",
      label: statusLabel(post?.status ?? "pending"),
    },
    consolidar: {
      status: agg?.status ?? "pending",
      label: statusLabel(agg?.status ?? "pending"),
      derivedComplete: OfficialEligibility.consolidar(
        pre?.status ?? null,
        enc?.status ?? null,
        post?.status ?? null,
      ),
    },
  };
}

export async function listConsolidarCycles(actorUserId: string, stage?: ConsolidarStage) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  await ensureOfficialCatalog();
  const db = getDb();
  if (stage) {
    const [program] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.code, STAGE_CODE[stage]))
      .limit(1);
    if (!program) return [];
    return db
      .select()
      .from(trainingCycles)
      .where(eq(trainingCycles.programId, program.id))
      .orderBy(desc(trainingCycles.startDate));
  }
  const programs = await db
    .select()
    .from(trainingPrograms)
    .where(
      inArray(trainingPrograms.code, [
        PRE_ENCUENTRO_CODE,
        ENCUENTRO_CODE,
        POST_ENCUENTRO_CODE,
      ]),
    );
  const ids = programs.map((p) => p.id);
  if (!ids.length) return [];
  return db
    .select()
    .from(trainingCycles)
    .where(inArray(trainingCycles.programId, ids))
    .orderBy(desc(trainingCycles.startDate));
}

export async function getConsolidarCycleBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, cycleId))
    .limit(1);
  if (!cycle) throw new DomainError(DomainErrorCode.NOT_FOUND, "Ciclo no encontrado.");
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.id, cycle.programId))
    .limit(1);
  const modules = await db
    .select()
    .from(trainingModules)
    .where(
      and(eq(trainingModules.programId, cycle.programId), eq(trainingModules.isActive, true)),
    )
    .orderBy(asc(trainingModules.orderIndex));
  const enrollments = await db
    .select({
      enrollment: trainingEnrollments,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(trainingEnrollments)
    .innerJoin(persons, eq(persons.id, trainingEnrollments.personId))
    .where(eq(trainingEnrollments.cycleId, cycleId))
    .orderBy(asc(persons.lastName));

  const scoped = [];
  for (const row of enrollments) {
    try {
      const org = await currentOrg(row.enrollment.personId);
      if (org?.ministryId) {
        await assertProcessAccess(actor, row.enrollment.personId, org.ministryId);
      } else if (!isSuperadmin(actor) && !isLeaderGeneral(actor)) {
        continue;
      }
      scoped.push(row);
    } catch {
      // skip
    }
  }
  const enrollmentIds = scoped.map((s) => s.enrollment.id);
  const attendanceRows =
    enrollmentIds.length === 0
      ? []
      : await db
          .select()
          .from(trainingAttendance)
          .where(inArray(trainingAttendance.enrollmentId, enrollmentIds));

  return {
    cycle,
    program,
    modules,
    participants: scoped.map((s) => ({
      enrollmentId: s.enrollment.id,
      personId: s.enrollment.personId,
      fullName: formatFullName(s.firstName, s.lastName),
      status: s.enrollment.status,
      attendance: Object.fromEntries(
        attendanceRows
          .filter((a) => a.enrollmentId === s.enrollment.id)
          .map((a) => [a.moduleId, a]),
      ),
    })),
  };
}

export const ConsolidarRules = {
  needsPreForEncuentro: OfficialEligibility.encuentro,
  needsEncuentroForPost: OfficialEligibility.postEncuentro,
  consolidarFromThree: OfficialEligibility.consolidar,
  preClassCount: 4,
  postClassCount: 4,
  encuentroDays: 3,
};
