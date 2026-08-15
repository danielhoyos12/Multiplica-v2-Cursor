/**
 * Escuela Ministerial levels EM1 → EM2 → EM3 (official Discípular sequence).
 * Legacy single `escuela_ministerial` program is DEPRECATED.
 */
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  EM1_CODE,
  EM2_CODE,
  EM3_CODE,
  personOrganizationHistory,
  personProcessEvents,
  personProcessProgress,
  persons,
  trainingAttendance,
  trainingCompletionRequirements,
  trainingCycles,
  trainingEnrollments,
  trainingModules,
  trainingPrograms,
  trainingRequirementOverrides,
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
import { ensureOfficialCatalog } from "@/modules/formation/official-catalog";

export type EmLevel = 1 | 2 | 3;

const LEVEL_CODE: Record<EmLevel, string> = {
  1: EM1_CODE,
  2: EM2_CODE,
  3: EM3_CODE,
};

const LEVEL_PROCESS: Record<EmLevel, "em1" | "em2" | "em3"> = {
  1: "em1",
  2: "em2",
  3: "em3",
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

async function getEmProgress(personId: string, level: EmLevel) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, LEVEL_PROCESS[level]),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function ensureEmLevelEligible(
  personId: string,
  level: EmLevel,
  ministryId: string,
  networkId: string | null,
) {
  const existing = await getEmProgress(personId, level);
  if (existing) {
    if (existing.status === "pending") {
      const db = getDb();
      const [row] = await db
        .update(personProcessProgress)
        .set({
          status: "eligible",
          currentStep: `apto_em${level}`,
          updatedAt: new Date(),
        })
        .where(eq(personProcessProgress.id, existing.id))
        .returning();
      return row;
    }
    return existing;
  }
  const db = getDb();
  const [row] = await db
    .insert(personProcessProgress)
    .values({
      personId,
      processType: LEVEL_PROCESS[level],
      status: "eligible",
      stage: `em${level}`,
      currentStep: `apto_em${level}`,
      ministryId,
      networkId,
      metadata: {},
    })
    .returning();
  return row;
}

export async function assertEmLevelEligible(personId: string, level: EmLevel) {
  const db = getDb();
  if (level === 1) {
    const [cd3] = await db
      .select()
      .from(personProcessProgress)
      .where(
        and(
          eq(personProcessProgress.personId, personId),
          eq(personProcessProgress.processType, "destino_n3"),
        ),
      )
      .limit(1);
    if (!cd3 || cd3.status !== "completed") {
      throw new DomainError(
        DomainErrorCode.MINISTERIAL_SCHOOL_NOT_ELIGIBLE,
        "Capacitación Destino 3 debe estar completada.",
      );
    }
    return;
  }
  const prev = await getEmProgress(personId, (level - 1) as EmLevel);
  if (!prev || prev.status !== "completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_NOT_ELIGIBLE,
      `Escuela Ministerial ${level - 1} debe estar completada.`,
    );
  }
}

export async function isEmLevelEligible(personId: string, level: EmLevel) {
  try {
    await assertEmLevelEligible(personId, level);
    const cur = await getEmProgress(personId, level);
    if (cur?.status === "completed") return false;
    return true;
  } catch {
    return false;
  }
}

async function getProgram(level: EmLevel) {
  await ensureOfficialCatalog();
  const db = getDb();
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.code, LEVEL_CODE[level]))
    .limit(1);
  if (!program) {
    throw new DomainError(DomainErrorCode.CONFIGURATION_ERROR, "Programa EM no configurado.");
  }
  return program;
}

export async function createEmLevelCycle(
  actorUserId: string,
  raw: {
    level: EmLevel;
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
  const program = await getProgram(raw.level);
  const db = getDb();
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

export async function enrollEmLevel(
  actorUserId: string,
  raw: { personId: string; cycleId: string; level: EmLevel },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministerial_school.manage", {
    type: "training",
    personId: raw.personId,
  });
  await assertEmLevelEligible(raw.personId, raw.level);
  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia.");
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);
  const program = await getProgram(raw.level);
  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, raw.cycleId))
    .limit(1);
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_CYCLE_NOT_ACTIVE,
      "Solo ciclos activos admiten inscripción.",
    );
  }
  if (cycle.programId !== program.id) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Ciclo no corresponde al nivel EM.");
  }

  const progress = await getEmProgress(raw.personId, raw.level);
  if (progress?.status === "completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ALREADY_COMPLETED,
      "Nivel EM ya completado.",
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
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ALREADY_ENROLLED,
      "Ya inscrito en este ciclo.",
    );
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
        processType: LEVEL_PROCESS[raw.level],
        status: "in_progress",
        stage: `em${raw.level}`,
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

  await db.insert(personProcessEvents).values({
    progressId: updated.id,
    personId: raw.personId,
    processType: LEVEL_PROCESS[raw.level],
    eventType: "enrolled",
    fromStatus: (progress?.status as never) ?? null,
    toStatus: "in_progress",
    actorUserId,
    metadata: { cycleId: cycle.id, enrollmentId: enrollment.id },
  });
  await writeAuditLog({
    actorUserId,
    action: "ministerial_school.enrolled",
    entityType: "training_enrollment",
    entityId: enrollment.id,
    metadata: { personId: raw.personId, level: raw.level },
  });
  return { enrollment, progress: updated };
}

export async function markEmLevelAcademic(
  actorUserId: string,
  raw: { personId: string; level: EmLevel; enrollmentId?: string },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministerial_school.complete", {
    type: "training",
    personId: raw.personId,
  });
  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia.");
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);
  const progress = await getEmProgress(raw.personId, raw.level);
  if (!progress || progress.status === "completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ALREADY_COMPLETED,
      "Estado inválido para académico.",
    );
  }
  const db = getDb();
  if (raw.enrollmentId) {
    await db
      .update(trainingEnrollments)
      .set({ status: "academic_completed", updatedAt: new Date() })
      .where(eq(trainingEnrollments.id, raw.enrollmentId));
  }
  const [row] = await db
    .update(personProcessProgress)
    .set({
      status: "academic_completed",
      currentStep: "academic_completed",
      updatedAt: new Date(),
    })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();
  await writeAuditLog({
    actorUserId,
    action: "ministerial_school.academic_completed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId: raw.personId, level: raw.level },
  });
  return row;
}

export async function completeEmLevel(
  actorUserId: string,
  raw: { personId: string; level: EmLevel; note?: string },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministerial_school.complete", {
    type: "training",
    personId: raw.personId,
  });
  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia.");
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);
  const progress = await getEmProgress(raw.personId, raw.level);
  if (!progress) {
    throw new DomainError(DomainErrorCode.PROCESS_NOT_FOUND, "Progreso EM no encontrado.");
  }
  if (progress.status === "completed") {
    return {
      progress,
      nextEligible: raw.level < 3 ? raw.level + 1 : null,
      leadershipActivated: false,
    };
  }
  if (progress.status !== "academic_completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ACADEMIC_NOT_COMPLETED,
      "Marque primero el componente académico.",
    );
  }

  const program = await getProgram(raw.level);
  const db = getDb();
  const requirements = await db
    .select()
    .from(trainingCompletionRequirements)
    .where(
      and(
        eq(trainingCompletionRequirements.programId, program.id),
        eq(trainingCompletionRequirements.isActive, true),
        eq(trainingCompletionRequirements.isRequired, true),
      ),
    );
  const overrides = await db
    .select()
    .from(trainingRequirementOverrides)
    .where(
      and(
        eq(trainingRequirementOverrides.personId, raw.personId),
        eq(trainingRequirementOverrides.programId, program.id),
      ),
    );
  const overridden = new Set(overrides.map((o) => o.requirementId).filter(Boolean));
  for (const req of requirements) {
    if (overridden.has(req.id)) continue;
    if (req.requirementType === "manual_approval" || req.category === "academic") {
      // academic already verified via status
      continue;
    }
  }

  const [row] = await db
    .update(personProcessProgress)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedByUserId: actorUserId,
      currentStep: "completado",
      updatedAt: new Date(),
      metadata: {
        ...(progress.metadata ?? {}),
        formally_completed: true,
        leadership_activated: false,
      },
    })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "ministerial_school.completed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: {
      personId: raw.personId,
      level: raw.level,
      leadership_activated: false,
    },
  });

  let nextEligible: number | null = null;
  if (raw.level < 3) {
    nextEligible = raw.level + 1;
    await ensureEmLevelEligible(
      raw.personId,
      (raw.level + 1) as EmLevel,
      org.ministryId,
      org.networkId,
    );
    await writeAuditLog({
      actorUserId,
      action: "ministerial_school.next_stage_eligible",
      entityType: "person_process_progress",
      entityId: row.id,
      metadata: { personId: raw.personId, nextLevel: nextEligible },
    });
  } else {
    await writeAuditLog({
      actorUserId,
      action: "ministerial_school.next_stage_eligible",
      entityType: "person_process_progress",
      entityId: row.id,
      metadata: {
        personId: raw.personId,
        nextStage: "enviar",
        NEXT_STAGE_ELIGIBLE: true,
        implemented: false,
      },
    });
    await db
      .update(personProcessProgress)
      .set({
        metadata: {
          ...(row.metadata ?? {}),
          eligible_for_send: true,
          NEXT_STAGE_ELIGIBLE: true,
        },
        updatedAt: new Date(),
      })
      .where(eq(personProcessProgress.id, row.id));
  }

  return { progress: row, nextEligible, leadershipActivated: false };
}

export async function getEmLevelsDashboardCounts(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (
    !hasPermission(actor, "ministerial_school.read") &&
    !hasPermission(actor, "process.read")
  ) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const types = ["em1", "em2", "em3"] as const;
  const conditions = [inArray(personProcessProgress.processType, [...types])];
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
    em1: pick("em1", ["in_progress", "eligible", "pending", "academic_completed"]),
    em1Completed: pick("em1", ["completed"]),
    em2: pick("em2", ["in_progress", "eligible", "pending", "academic_completed"]),
    em2Completed: pick("em2", ["completed"]),
    em3: pick("em3", ["in_progress", "eligible", "pending", "academic_completed"]),
    em3Completed: pick("em3", ["completed"]),
  };
}

export async function listEmLevelCycles(actorUserId: string, level?: EmLevel) {
  const actor = await requireActor(actorUserId);
  if (
    !hasPermission(actor, "ministerial_school.read") &&
    !hasPermission(actor, "process.read")
  ) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  await ensureOfficialCatalog();
  const db = getDb();
  if (level) {
    const program = await getProgram(level);
    return db
      .select()
      .from(trainingCycles)
      .where(eq(trainingCycles.programId, program.id))
      .orderBy(desc(trainingCycles.startDate));
  }
  const programs = await db
    .select()
    .from(trainingPrograms)
    .where(inArray(trainingPrograms.code, [EM1_CODE, EM2_CODE, EM3_CODE]));
  const ids = programs.map((p) => p.id);
  if (!ids.length) return [];
  return db
    .select()
    .from(trainingCycles)
    .where(inArray(trainingCycles.programId, ids))
    .orderBy(desc(trainingCycles.startDate));
}

export async function getEmLevelCycleBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (
    !hasPermission(actor, "ministerial_school.read") &&
    !hasPermission(actor, "process.read")
  ) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
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
    doctrina: modules.filter((m) => m.componentCode === "doctrina"),
    seminario: modules.filter((m) => m.componentCode === "seminario"),
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

export async function getPersonEmLevelsSummary(personId: string) {
  const em1 = await getEmProgress(personId, 1);
  const em2 = await getEmProgress(personId, 2);
  const em3 = await getEmProgress(personId, 3);
  return {
    em1: {
      status: em1?.status ?? "pending",
      label: statusLabel(em1?.status ?? "pending"),
    },
    em2: {
      status: em2?.status ?? "pending",
      label: statusLabel(em2?.status ?? "pending"),
    },
    em3: {
      status: em3?.status ?? "pending",
      label: statusLabel(em3?.status ?? "pending"),
    },
  };
}

export const EmLevelRules = {
  canEnterEm1(cd3: string | null | undefined) {
    return cd3 === "completed";
  },
  canEnterNext(prevCompleted: boolean) {
    return prevCompleted;
  },
  completingDoesNotActivateLeader: true as const,
};
