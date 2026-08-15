/**
 * Re-Encuentro — post Escuela Ministerial.
 * Modeled as training program with a single event module (RE-EVENT).
 * Completing does NOT activate leadership / create cell / credentials.
 */
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  personOrganizationHistory,
  personProcessEvents,
  personProcessProgress,
  persons,
  REENCUENTRO_FAMILY,
  REENCUENTRO_PROGRAM_CODE,
  trainingAttendance,
  trainingCycles,
  trainingCycleStaff,
  trainingEnrollments,
  trainingModules,
  trainingPrograms,
} from "@/db/schema";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { writeAuditLog } from "@/modules/audit";
import {
  assertCanMutate,
  canAccessMinistry,
  hasPermission,
  isLeaderGeneral,
  isSuperadmin,
  loadAuthContext,
  type AuthContext,
} from "@/modules/authorization";
import { formatFullName } from "@/modules/ganar/normalize";
import { assertProcessAccess, statusLabel } from "@/modules/formation/service";

const PROCESS = "reencuentro" as const;
const EVENT_MODULE_CODE = "RE-EVENT";

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

async function getReProgress(personId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, PROCESS),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function appendEvent(params: {
  progressId: string;
  personId: string;
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
    processType: PROCESS,
    eventType: params.eventType,
    fromStatus: (params.fromStatus as never) ?? null,
    toStatus: (params.toStatus as never) ?? null,
    actorUserId: params.actorUserId,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
  });
}

export async function ensureReencuentroProgram() {
  const db = getDb();
  let [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.code, REENCUENTRO_PROGRAM_CODE))
    .limit(1);
  if (!program) {
    [program] = await db
      .insert(trainingPrograms)
      .values({
        code: REENCUENTRO_PROGRAM_CODE,
        name: "Re-Encuentro",
        description: "Evento pastoral posterior a Escuela Ministerial (módulo único).",
        family: REENCUENTRO_FAMILY,
        isActive: true,
      })
      .returning();
  } else if (program.family !== REENCUENTRO_FAMILY) {
    [program] = await db
      .update(trainingPrograms)
      .set({
        family: REENCUENTRO_FAMILY,
        name: "Re-Encuentro",
        updatedAt: new Date(),
      })
      .where(eq(trainingPrograms.id, program.id))
      .returning();
  }

  const modules = await db
    .select()
    .from(trainingModules)
    .where(eq(trainingModules.programId, program.id));
  if (modules.length === 0) {
    await db.insert(trainingModules).values({
      programId: program.id,
      code: EVENT_MODULE_CODE,
      name: "Evento Re-Encuentro",
      orderIndex: 1,
      isActive: true,
      isRequired: true,
    });
  }
  return program;
}

export async function ensureReencuentroEligible(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  const existing = await getReProgress(personId);
  if (existing) {
    if (existing.status === "pending") {
      const db = getDb();
      const [row] = await db
        .update(personProcessProgress)
        .set({
          status: "eligible",
          currentStep: "apto_reencuentro",
          updatedAt: new Date(),
          metadata: { ...(existing.metadata ?? {}), eligible_for_reencuentro: true },
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
      processType: PROCESS,
      status: "eligible",
      stage: "reencuentro",
      currentStep: "apto_reencuentro",
      ministryId,
      networkId,
      metadata: { eligible_for_reencuentro: true },
    })
    .returning();
  return row;
}

export async function assertReencuentroEligible(personId: string) {
  // Official: CD2 completed — NOT Escuela Ministerial
  const db = getDb();
  const [cd2] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, "destino_n2"),
      ),
    )
    .limit(1);
  if (!cd2 || cd2.status !== "completed") {
    throw new DomainError(
      DomainErrorCode.REENCOUNTER_NOT_ELIGIBLE,
      "Capacitación Destino 2 debe estar completada.",
    );
  }
}

export async function isReencuentroEligible(personId: string) {
  try {
    await assertReencuentroEligible(personId);
    const current = await getReProgress(personId);
    if (current?.status === "completed") return false;
    return true;
  } catch {
    return false;
  }
}

async function getProgram() {
  await ensureReencuentroProgram();
  const db = getDb();
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.code, REENCUENTRO_PROGRAM_CODE))
    .limit(1);
  if (!program) {
    throw new DomainError(
      DomainErrorCode.CONFIGURATION_ERROR,
      "Programa Re-Encuentro no configurado.",
    );
  }
  return program;
}

async function assertCycleStaffOrManage(actor: AuthContext, cycleId: string) {
  if (isSuperadmin(actor)) return;
  if (
    hasPermission(actor, "reencounter.manage") ||
    hasPermission(actor, "school.cycles.manage")
  ) {
    return;
  }
  const db = getDb();
  const [staff] = await db
    .select()
    .from(trainingCycleStaff)
    .where(
      and(eq(trainingCycleStaff.cycleId, cycleId), eq(trainingCycleStaff.userId, actor.userId)),
    )
    .limit(1);
  if (!staff) {
    throw new DomainError(
      DomainErrorCode.REENCOUNTER_ACCESS_DENIED,
      "No eres staff asignado a este evento.",
    );
  }
}

export async function createReencuentroEvent(
  actorUserId: string,
  raw: {
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
  const program = await getProgram();
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
  await writeAuditLog({
    actorUserId,
    action: "school.cycle.created",
    entityType: "training_cycle",
    entityId: cycle.id,
    metadata: { program: REENCUENTRO_PROGRAM_CODE },
  });
  return cycle;
}

export async function enrollReencuentro(
  actorUserId: string,
  raw: { personId: string; cycleId: string },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "reencounter.manage", {
    type: "training",
    personId: raw.personId,
  });
  await assertReencuentroEligible(raw.personId);
  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia.");
  }
  if (!canAccessMinistry(actor, org.ministryId) && !isSuperadmin(actor)) {
    throw new DomainError(
      DomainErrorCode.CROSS_MINISTRY_PROCESS_DENIED,
      "Cross-ministry denegado.",
    );
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);

  const program = await getProgram();
  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, raw.cycleId))
    .limit(1);
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.REENCOUNTER_EVENT_NOT_ACTIVE,
      "Solo eventos activos admiten inscripción.",
    );
  }
  if (cycle.programId !== program.id) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Ciclo no es Re-Encuentro.");
  }

  const progress = await getReProgress(raw.personId);
  if (progress?.status === "completed") {
    throw new DomainError(
      DomainErrorCode.REENCOUNTER_ALREADY_COMPLETED,
      "Re-Encuentro ya completado.",
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
      DomainErrorCode.REENCOUNTER_ALREADY_ENROLLED,
      "Ya inscrito en este evento.",
    );
  }

  const [enrollment] = await db
    .insert(trainingEnrollments)
    .values({
      cycleId: raw.cycleId,
      personId: raw.personId,
      status: "in_progress",
    })
    .returning();

  let updatedProgress = progress;
  if (!updatedProgress) {
    const [created] = await db
      .insert(personProcessProgress)
      .values({
        personId: raw.personId,
        processType: PROCESS,
        status: "in_progress",
        stage: "reencuentro",
        currentStep: "inscrito",
        ministryId: org.ministryId,
        networkId: org.networkId,
        startedAt: new Date(),
        metadata: { cycleId: cycle.id },
      })
      .returning();
    updatedProgress = created;
  } else {
    const [row] = await db
      .update(personProcessProgress)
      .set({
        status: "in_progress",
        startedAt: updatedProgress.startedAt ?? new Date(),
        currentStep: "inscrito",
        metadata: { ...(updatedProgress.metadata ?? {}), cycleId: cycle.id },
        updatedAt: new Date(),
      })
      .where(eq(personProcessProgress.id, updatedProgress.id))
      .returning();
    updatedProgress = row;
  }

  await appendEvent({
    progressId: updatedProgress.id,
    personId: raw.personId,
    eventType: "enrolled",
    fromStatus: progress?.status ?? null,
    toStatus: "in_progress",
    actorUserId,
    metadata: { cycleId: cycle.id, enrollmentId: enrollment.id },
  });
  await writeAuditLog({
    actorUserId,
    action: "reencounter.enrolled",
    entityType: "training_enrollment",
    entityId: enrollment.id,
    metadata: { personId: raw.personId, cycleId: cycle.id },
  });
  return { enrollment, progress: updatedProgress };
}

/** Record event attendance on the single RE-EVENT module. */
export async function recordReencuentroAttendance(
  actorUserId: string,
  raw: {
    enrollmentId: string;
    status: "present" | "absent" | "excused" | "recovered";
    attendanceDate: string;
    notes?: string;
  },
) {
  const actor = await requireActor(actorUserId);
  if (
    !hasPermission(actor, "reencounter.attendance") &&
    !hasPermission(actor, "reencounter.manage")
  ) {
    throw new DomainError(DomainErrorCode.REENCOUNTER_ACCESS_DENIED, "Sin permiso.");
  }

  const db = getDb();
  const [enrollment] = await db
    .select()
    .from(trainingEnrollments)
    .where(eq(trainingEnrollments.id, raw.enrollmentId))
    .limit(1);
  if (!enrollment) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Inscripción no encontrada.");
  }
  await assertCycleStaffOrManage(actor, enrollment.cycleId);

  const org = await currentOrg(enrollment.personId);
  if (org?.ministryId) {
    await assertProcessAccess(actor, enrollment.personId, org.ministryId);
  }

  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, enrollment.cycleId))
    .limit(1);
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.REENCOUNTER_EVENT_NOT_ACTIVE,
      "Evento no activo.",
    );
  }

  const [module] = await db
    .select()
    .from(trainingModules)
    .where(
      and(
        eq(trainingModules.programId, cycle.programId),
        eq(trainingModules.code, EVENT_MODULE_CODE),
      ),
    )
    .limit(1);
  if (!module) {
    throw new DomainError(DomainErrorCode.TRAINING_MODULE_INACTIVE, "Módulo evento ausente.");
  }

  const [existing] = await db
    .select()
    .from(trainingAttendance)
    .where(
      and(
        eq(trainingAttendance.enrollmentId, raw.enrollmentId),
        eq(trainingAttendance.moduleId, module.id),
      ),
    )
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(trainingAttendance)
      .set({
        status: raw.status,
        attendanceDate: raw.attendanceDate,
        recordedByUserId: actorUserId,
        recordedAt: new Date(),
        notes: raw.notes ?? existing.notes,
      })
      .where(eq(trainingAttendance.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(trainingAttendance)
      .values({
        enrollmentId: raw.enrollmentId,
        moduleId: module.id,
        attendanceDate: raw.attendanceDate,
        status: raw.status,
        recordedByUserId: actorUserId,
        notes: raw.notes ?? null,
      })
      .returning();
  }

  await writeAuditLog({
    actorUserId,
    action: "reencounter.attendance_recorded",
    entityType: "training_attendance",
    entityId: row.id,
    metadata: {
      enrollmentId: raw.enrollmentId,
      status: raw.status,
    },
  });
  return row;
}

export async function completeReencuentro(
  actorUserId: string,
  raw: { personId: string; enrollmentId?: string; note?: string },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "reencounter.complete", {
    type: "training",
    personId: raw.personId,
  });
  await assertReencuentroEligible(raw.personId);
  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia.");
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);

  const progress = await getReProgress(raw.personId);
  if (!progress) {
    throw new DomainError(DomainErrorCode.PROCESS_NOT_FOUND, "Progreso Re-Encuentro no encontrado.");
  }
  if (progress.status === "completed") {
    return {
      progress,
      nextStageEligible: true,
      eligibleForSend: true,
      leadershipActivated: false,
    };
  }

  const db = getDb();
  if (raw.enrollmentId) {
    const [enrollment] = await db
      .select()
      .from(trainingEnrollments)
      .where(eq(trainingEnrollments.id, raw.enrollmentId))
      .limit(1);
    if (enrollment) {
      await assertCycleStaffOrManage(actor, enrollment.cycleId);
      await db
        .update(trainingEnrollments)
        .set({
          status: "completed",
          completedAt: new Date(),
          completedByUserId: actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(trainingEnrollments.id, enrollment.id));
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
        next_stage: "destino_n3",
        leadership_activated: false,
      },
    })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();

  await appendEvent({
    progressId: row.id,
    personId: raw.personId,
    eventType: "completed",
    fromStatus: progress.status,
    toStatus: "completed",
    actorUserId,
    note: raw.note,
    metadata: { next_stage: "destino_n3" },
  });
  await writeAuditLog({
    actorUserId,
    action: "reencounter.completed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: {
      personId: raw.personId,
      leadership_activated: false,
      cell_created: false,
      next_stage: "destino_n3",
    },
  });

  // Re-Encuentro → CD3 eligible
  const [cd3] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, raw.personId),
        eq(personProcessProgress.processType, "destino_n3"),
      ),
    )
    .limit(1);
  if (!cd3) {
    await db.insert(personProcessProgress).values({
      personId: raw.personId,
      processType: "destino_n3",
      status: "eligible",
      stage: "n3",
      currentStep: "apto_n3",
      ministryId: org.ministryId,
      networkId: org.networkId,
      metadata: { eligible_from: "reencuentro" },
    });
  } else if (cd3.status === "pending") {
    await db
      .update(personProcessProgress)
      .set({ status: "eligible", currentStep: "apto_n3", updatedAt: new Date() })
      .where(eq(personProcessProgress.id, cd3.id));
  }

  await writeAuditLog({
    actorUserId,
    action: "reencounter.next_stage_eligible",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: {
      personId: raw.personId,
      nextStage: "destino_n3",
      implemented: true,
    },
  });

  return {
    progress: row,
    nextStageEligible: true,
    eligibleForSend: false,
    leadershipActivated: false,
  };
}

export async function listReencuentroEligible(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "reencounter.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.REENCOUNTER_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const cd2Done = await db
    .select({
      personId: personProcessProgress.personId,
      ministryId: personProcessProgress.ministryId,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(personProcessProgress)
    .innerJoin(persons, eq(persons.id, personProcessProgress.personId))
    .where(
      and(
        eq(personProcessProgress.processType, "destino_n2"),
        eq(personProcessProgress.status, "completed"),
      ),
    );
  const result = [];
  for (const row of cd2Done) {
    if (!isSuperadmin(actor) && !canAccessMinistry(actor, row.ministryId)) continue;
    try {
      await assertProcessAccess(actor, row.personId, row.ministryId);
    } catch {
      continue;
    }
    const re = await getReProgress(row.personId);
    if (re?.status === "completed") continue;
    result.push({
      personId: row.personId,
      fullName: formatFullName(row.firstName, row.lastName),
      status: re?.status ?? "eligible",
    });
  }
  return result;
}

export async function getReencuentroDashboardCounts(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "reencounter.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.REENCOUNTER_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const conditions = [eq(personProcessProgress.processType, PROCESS)];
  if (!isSuperadmin(actor) && actor.ministryIds.length) {
    conditions.push(inArray(personProcessProgress.ministryId, actor.ministryIds));
  }
  const rows = await db
    .select({ status: personProcessProgress.status, c: count() })
    .from(personProcessProgress)
    .where(and(...conditions))
    .groupBy(personProcessProgress.status);
  const pick = (statuses: string[]) =>
    rows.filter((r) => statuses.includes(r.status)).reduce((a, r) => a + Number(r.c), 0);
  const eligible = await listReencuentroEligible(actorUserId);
  return {
    eligible: eligible.length,
    enrolled: pick(["in_progress", "eligible", "pending"]),
    completed: pick(["completed"]),
    pending: pick(["pending", "eligible"]),
  };
}

export async function listReencuentroEvents(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "reencounter.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.REENCOUNTER_ACCESS_DENIED, "Sin permiso.");
  }
  const program = await getProgram();
  const db = getDb();
  return db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.programId, program.id))
    .orderBy(desc(trainingCycles.startDate));
}

export async function getReencuentroEventBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "reencounter.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.REENCOUNTER_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, cycleId))
    .limit(1);
  if (!cycle) throw new DomainError(DomainErrorCode.NOT_FOUND, "Evento no encontrado.");
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.id, cycle.programId))
    .limit(1);
  const modules = await db
    .select()
    .from(trainingModules)
    .where(eq(trainingModules.programId, cycle.programId))
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
  const eventModule = modules.find((m) => m.code === EVENT_MODULE_CODE) ?? modules[0];

  return {
    cycle,
    program,
    eventModule,
    participants: scoped.map((s) => {
      const att = eventModule
        ? attendanceRows.find(
            (a) => a.enrollmentId === s.enrollment.id && a.moduleId === eventModule.id,
          )
        : undefined;
      return {
        enrollmentId: s.enrollment.id,
        personId: s.enrollment.personId,
        fullName: formatFullName(s.firstName, s.lastName),
        status: s.enrollment.status,
        attendanceStatus: att?.status ?? null,
        attendanceId: att?.id ?? null,
      };
    }),
  };
}

export async function getPersonReencuentroSummary(personId: string) {
  const re = await getReProgress(personId);
  return re
    ? {
        status: re.status,
        label: statusLabel(re.status),
        completedAt: re.completedAt,
        eligibleForSend: Boolean(re.metadata?.eligible_for_send),
      }
    : {
        status: "pending",
        label: "Pendiente",
        completedAt: null,
        eligibleForSend: false,
      };
}

export const ReencuentroRules = {
  /** Official: Re-Encuentro after CD2 completed (NOT after Escuela Ministerial). */
  canEnter(cd2Status: string | null | undefined) {
    return cd2Status === "completed";
  },
  eligibilityDoesNotEnroll: true as const,
  completingDoesNotActivateLeader: true as const,
  completingDoesNotCreateCell: true as const,
  nextStageIsCd3: true as const,
  notAfterEscuelaMinisterial: true as const,
  /** @deprecated alias kept for tests that expected eligibility-only next stage */
  nextStageIsEligibilityOnly: true as const,
};
