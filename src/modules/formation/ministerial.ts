/**
 * Escuela Ministerial — post Destino N3.
 * Reuses training_* + person_process_*. Never creates person silos or auto-leadership.
 */
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  EM_FAMILY,
  EM_PROGRAM_CODE,
  personOrganizationHistory,
  personProcessEvents,
  personProcessProgress,
  persons,
  trainingAttendance,
  trainingCompletionRequirements,
  trainingCycles,
  trainingCycleStaff,
  trainingEnrollments,
  trainingModules,
  trainingPrograms,
  trainingRequirementOverrides,
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

const PROCESS = "escuela_ministerial" as const;

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

async function getEmProgress(personId: string) {
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

async function getDestinoN3(personId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, "destino_n3"),
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

export async function ensureEmProgram() {
  const db = getDb();
  let [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.code, EM_PROGRAM_CODE))
    .limit(1);
  if (!program) {
    [program] = await db
      .insert(trainingPrograms)
      .values({
        code: EM_PROGRAM_CODE,
        name: "Escuela Ministerial",
        description: "Formación posterior a Capacitación Destino.",
        family: EM_FAMILY,
        isActive: true,
      })
      .returning();
  } else if (program.family !== EM_FAMILY) {
    [program] = await db
      .update(trainingPrograms)
      .set({ family: EM_FAMILY, name: "Escuela Ministerial", updatedAt: new Date() })
      .where(eq(trainingPrograms.id, program.id))
      .returning();
  }

  const modules = await db
    .select()
    .from(trainingModules)
    .where(eq(trainingModules.programId, program.id));
  if (modules.length === 0) {
    await db.insert(trainingModules).values(
      [1, 2, 3, 4].map((n) => ({
        programId: program.id,
        code: `EM-M${n}`,
        name: `Módulo ${n}`,
        orderIndex: n,
        isActive: true,
        isRequired: true,
      })),
    );
  }

  const reqs = await db
    .select()
    .from(trainingCompletionRequirements)
    .where(eq(trainingCompletionRequirements.programId, program.id));
  if (reqs.length === 0) {
    await db.insert(trainingCompletionRequirements).values({
      programId: program.id,
      requirementType: "manual_approval",
      category: "academic",
      label: "Componente académico aprobado",
      isRequired: true,
      isActive: true,
    });
  }
  return program;
}

export async function ensureEmEligible(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  const existing = await getEmProgress(personId);
  if (existing) {
    if (existing.status === "pending") {
      const db = getDb();
      const [row] = await db
        .update(personProcessProgress)
        .set({
          status: "eligible",
          currentStep: "apto_em",
          updatedAt: new Date(),
          metadata: { ...(existing.metadata ?? {}), eligible_for_em: true },
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
      stage: "em",
      currentStep: "apto_em",
      ministryId,
      networkId,
      metadata: { eligible_for_em: true },
    })
    .returning();
  return row;
}

export async function assertEmEligible(personId: string) {
  const n3 = await getDestinoN3(personId);
  if (!n3 || n3.status !== "completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_NOT_ELIGIBLE,
      "Destino Nivel 3 debe estar formalmente completado.",
    );
  }
}

export async function isEmEligible(personId: string) {
  try {
    await assertEmEligible(personId);
    const current = await getEmProgress(personId);
    if (current?.status === "completed") return false;
    return true;
  } catch {
    return false;
  }
}

async function getEmProgram() {
  await ensureEmProgram();
  const db = getDb();
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.code, EM_PROGRAM_CODE))
    .limit(1);
  if (!program) {
    throw new DomainError(DomainErrorCode.CONFIGURATION_ERROR, "Programa EM no configurado.");
  }
  return program;
}

async function assertCycleStaffOrManage(
  actor: AuthContext,
  cycleId: string,
  capability: "attendance" | "recovery" | "academic" | "complete",
) {
  if (isSuperadmin(actor)) return;
  if (
    hasPermission(actor, "ministerial_school.manage") ||
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
      DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED,
      "No eres staff asignado a este ciclo.",
    );
  }
  if (capability === "attendance" && !staff.canTakeAttendance) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  if (capability === "recovery" && !staff.canAuthorizeRecovery) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  if (capability === "academic" && !staff.canCompleteAcademic) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  if (capability === "complete" && !staff.canCompleteLevel) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
}

export async function evaluateEmRequirements(personId: string) {
  const program = await getEmProgram();
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
        eq(trainingRequirementOverrides.personId, personId),
        eq(trainingRequirementOverrides.programId, program.id),
      ),
    );
  const overriddenIds = new Set(overrides.map((o) => o.requirementId).filter(Boolean));
  const progress = await getEmProgress(personId);
  const academicDone =
    progress?.status === "academic_completed" || progress?.status === "completed";

  const results = [];
  for (const req of requirements) {
    if (overriddenIds.has(req.id)) {
      results.push({
        requirementId: req.id,
        type: req.requirementType,
        category: req.category,
        label: req.label ?? req.requirementType,
        passed: true,
        overridden: true,
      });
      continue;
    }
    if (req.requirementType === "manual_approval" || req.requirementType === "modules_completed") {
      results.push({
        requirementId: req.id,
        type: req.requirementType,
        category: req.category,
        label: req.label ?? "Componente académico",
        passed: academicDone,
        overridden: false,
      });
      continue;
    }
    results.push({
      requirementId: req.id,
      type: req.requirementType,
      category: req.category,
      label: req.label ?? req.requirementType,
      passed: false,
      overridden: false,
    });
  }
  return {
    programId: program.id,
    academicPassed: results.filter((r) => r.category === "academic").every((r) => r.passed),
    allPassed: results.every((r) => r.passed),
    results,
  };
}

export async function createEmCycle(
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
  const program = await getEmProgram();
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
    metadata: { program: EM_PROGRAM_CODE },
  });
  return cycle;
}

export async function enrollEm(
  actorUserId: string,
  raw: { personId: string; cycleId: string },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministerial_school.manage", {
    type: "training",
    personId: raw.personId,
  });
  await assertEmEligible(raw.personId);
  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia organizacional.");
  }
  if (!canAccessMinistry(actor, org.ministryId) && !isSuperadmin(actor)) {
    throw new DomainError(
      DomainErrorCode.CROSS_MINISTRY_PROCESS_DENIED,
      "Cross-ministry denegado.",
    );
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);

  const program = await getEmProgram();
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
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Ciclo no es Escuela Ministerial.");
  }

  const progress = await getEmProgress(raw.personId);
  if (progress?.status === "completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ALREADY_COMPLETED,
      "EM ya completada.",
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
        stage: "em",
        currentStep: "cursando",
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
        currentStep: "cursando",
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
    action: "ministerial_school.enrolled",
    entityType: "training_enrollment",
    entityId: enrollment.id,
    metadata: { personId: raw.personId, cycleId: cycle.id },
  });
  return { enrollment, progress: updatedProgress };
}

export async function markEmAcademicCompleted(
  actorUserId: string,
  raw: { personId: string; enrollmentId?: string; note?: string },
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

  const progress = await getEmProgress(raw.personId);
  if (!progress || !["in_progress", "paused", "academic_completed"].includes(progress.status)) {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_NOT_ELIGIBLE,
      "Debe estar cursando EM.",
    );
  }
  if (progress.status === "completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ALREADY_COMPLETED,
      "EM ya completada.",
    );
  }

  const db = getDb();
  if (raw.enrollmentId) {
    const [enrollment] = await db
      .select()
      .from(trainingEnrollments)
      .where(eq(trainingEnrollments.id, raw.enrollmentId))
      .limit(1);
    if (enrollment) {
      await assertCycleStaffOrManage(actor, enrollment.cycleId, "academic");
      await db
        .update(trainingEnrollments)
        .set({ status: "academic_completed", updatedAt: new Date() })
        .where(eq(trainingEnrollments.id, enrollment.id));
    }
  }

  const [row] = await db
    .update(personProcessProgress)
    .set({
      status: "academic_completed",
      currentStep: "academic_completed",
      updatedAt: new Date(),
      metadata: {
        ...(progress.metadata ?? {}),
        academic_completed_at: new Date().toISOString(),
      },
    })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();

  await appendEvent({
    progressId: row.id,
    personId: raw.personId,
    eventType: "academic_completed",
    fromStatus: progress.status,
    toStatus: "academic_completed",
    actorUserId,
    note: raw.note,
  });
  await writeAuditLog({
    actorUserId,
    action: "ministerial_school.academic_completed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId: raw.personId },
  });
  return row;
}

export async function completeEm(
  actorUserId: string,
  raw: {
    personId: string;
    note?: string;
    overrideRequirementIds?: string[];
    overrideReason?: string;
  },
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

  const progress = await getEmProgress(raw.personId);
  if (!progress) {
    throw new DomainError(DomainErrorCode.PROCESS_NOT_FOUND, "Progreso EM no encontrado.");
  }
  if (progress.status === "completed") {
    return { progress, nextStageEligible: true, leadershipActivated: false };
  }
  if (progress.status !== "academic_completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ACADEMIC_NOT_COMPLETED,
      "Marque primero el componente académico.",
    );
  }

  if (raw.overrideRequirementIds?.length) {
    if (
      !hasPermission(actor, "destination.override_requirement") &&
      !isSuperadmin(actor)
    ) {
      throw new DomainError(
        DomainErrorCode.DESTINATION_OVERRIDE_NOT_ALLOWED,
        "Sin permiso de override.",
      );
    }
    if (!raw.overrideReason?.trim()) {
      throw new DomainError(
        DomainErrorCode.DESTINATION_OVERRIDE_NOT_ALLOWED,
        "Override requiere razón.",
      );
    }
    const program = await getEmProgram();
    const db = getDb();
    for (const requirementId of raw.overrideRequirementIds) {
      await db.insert(trainingRequirementOverrides).values({
        personId: raw.personId,
        programId: program.id,
        requirementId,
        reason: raw.overrideReason.trim(),
        actorUserId,
      });
    }
  }

  const evaluation = await evaluateEmRequirements(raw.personId);
  if (!evaluation.allPassed) {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_REQUIREMENT_NOT_MET,
      "Requisitos pendientes.",
      { evaluation },
    );
  }

  const db = getDb();
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

  const program = await getEmProgram();
  const programCycles = await db
    .select({ id: trainingCycles.id })
    .from(trainingCycles)
    .where(eq(trainingCycles.programId, program.id));
  const cycleIds = programCycles.map((c) => c.id);
  if (cycleIds.length) {
    await db
      .update(trainingEnrollments)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedByUserId: actorUserId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(trainingEnrollments.personId, raw.personId),
          inArray(trainingEnrollments.cycleId, cycleIds),
          inArray(trainingEnrollments.status, [
            "enrolled",
            "in_progress",
            "academic_completed",
          ]),
        ),
      );
  }

  await appendEvent({
    progressId: row.id,
    personId: raw.personId,
    eventType: "completed",
    fromStatus: progress.status,
    toStatus: "completed",
    actorUserId,
    note: raw.note,
  });
  await writeAuditLog({
    actorUserId,
    action: "ministerial_school.completed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: {
      personId: raw.personId,
      leadership_activated: false,
      cell_created: false,
    },
  });

  // Legacy single-EM path: do NOT unlock Re-Encuentro (official: CD2 → RE → CD3).
  // Prefer em1|em2|em3 via em-levels.ts. Completing legacy EM only marks next-stage signal.
  await writeAuditLog({
    actorUserId,
    action: "ministerial_school.next_stage_eligible",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: {
      personId: raw.personId,
      nextStage: "legacy_em_completed_use_em_levels",
      deprecated: true,
    },
  });

  return { progress: row, nextStageEligible: true, leadershipActivated: false };
}

export async function pauseEm(actorUserId: string, personId: string, note?: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministerial_school.manage", { type: "training", personId });
  const org = await currentOrg(personId);
  if (org?.ministryId) await assertProcessAccess(actor, personId, org.ministryId);
  const progress = await getEmProgress(personId);
  if (!progress || progress.status === "completed") {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "No se puede pausar.");
  }
  const db = getDb();
  const [row] = await db
    .update(personProcessProgress)
    .set({ status: "paused", currentStep: "pausado", updatedAt: new Date() })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();
  await appendEvent({
    progressId: row.id,
    personId,
    eventType: "paused",
    fromStatus: progress.status,
    toStatus: "paused",
    actorUserId,
    note,
  });
  await writeAuditLog({
    actorUserId,
    action: "ministerial_school.paused",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId },
  });
  return row;
}

export async function resumeEm(actorUserId: string, personId: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministerial_school.manage", { type: "training", personId });
  const org = await currentOrg(personId);
  if (org?.ministryId) await assertProcessAccess(actor, personId, org.ministryId);
  const progress = await getEmProgress(personId);
  if (!progress || progress.status !== "paused") {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "No está pausado.");
  }
  const db = getDb();
  const [row] = await db
    .update(personProcessProgress)
    .set({ status: "in_progress", currentStep: "cursando", updatedAt: new Date() })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();
  await appendEvent({
    progressId: row.id,
    personId,
    eventType: "resumed",
    fromStatus: "paused",
    toStatus: "in_progress",
    actorUserId,
  });
  await writeAuditLog({
    actorUserId,
    action: "ministerial_school.resumed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId },
  });
  return row;
}

export async function listEmEligible(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (
    !hasPermission(actor, "ministerial_school.read") &&
    !hasPermission(actor, "process.read")
  ) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const n3Done = await db
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
        eq(personProcessProgress.processType, "destino_n3"),
        eq(personProcessProgress.status, "completed"),
      ),
    );
  const result = [];
  for (const row of n3Done) {
    if (!isSuperadmin(actor) && !canAccessMinistry(actor, row.ministryId)) continue;
    try {
      await assertProcessAccess(actor, row.personId, row.ministryId);
    } catch {
      continue;
    }
    const em = await getEmProgress(row.personId);
    if (em?.status === "completed") continue;
    result.push({
      personId: row.personId,
      fullName: formatFullName(row.firstName, row.lastName),
      status: em?.status ?? "eligible",
    });
  }
  return result;
}

export async function getEmDashboardCounts(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (
    !hasPermission(actor, "ministerial_school.read") &&
    !hasPermission(actor, "process.read")
  ) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
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
  const eligible = await listEmEligible(actorUserId);
  return {
    eligible: eligible.length,
    inProgress: pick(["in_progress", "eligible", "pending"]),
    academicCompleted: pick(["academic_completed"]),
    completed: pick(["completed"]),
    paused: pick(["paused"]),
    pendingRequirement: pick(["academic_completed"]),
  };
}

export async function listEmCycles(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (
    !hasPermission(actor, "ministerial_school.read") &&
    !hasPermission(actor, "process.read")
  ) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  const program = await getEmProgram();
  const db = getDb();
  return db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.programId, program.id))
    .orderBy(desc(trainingCycles.startDate));
}

export async function getEmCycleBoard(actorUserId: string, cycleId: string) {
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
      progressLabel: statusLabel(s.enrollment.status),
    })),
  };
}

export async function getPersonEmSummary(personId: string) {
  const em = await getEmProgress(personId);
  return em
    ? { status: em.status, label: statusLabel(em.status), cycleId: em.metadata?.cycleId ?? null }
    : { status: "pending", label: "Pendiente", cycleId: null };
}

export const MinisterialRules = {
  canEnter(destinoN3Status: string | null | undefined) {
    return destinoN3Status === "completed";
  },
  eligibilityDoesNotEnroll: true as const,
  completingDoesNotActivateLeader: true as const,
  completingDoesNotCreateCell: true as const,
  academicSeparateFromCompleted: true as const,
};
