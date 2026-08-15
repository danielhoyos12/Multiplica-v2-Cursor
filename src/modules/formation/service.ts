/**
 * Formation / Escalera del Éxito — Consolidar + Universidad de la Vida.
 * Persona Maestra (persons.id) is the only identity. No person silos.
 */
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  cellMemberships,
  cells,
  personOrganizationHistory,
  personProcessEvents,
  personProcessProgress,
  persons,
  trainingAttendance,
  trainingCycles,
  trainingEnrollments,
  trainingModules,
  trainingPrograms,
  UDV_PROGRAM_CODE,
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
import { isDescendantOf } from "@/modules/leadership/service";

import {
  authorizeRecoveryInputSchema,
  completeConsolidationInputSchema,
  completeUdvInputSchema,
  createCycleInputSchema,
  enrollUdvInputSchema,
  pauseProcessInputSchema,
  recordAttendanceInputSchema,
  resumeProcessInputSchema,
  startConsolidationInputSchema,
  type CreateCycleInput,
  type RecordAttendanceInput,
} from "./validation";

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

export async function assertProcessAccess(
  actor: AuthContext,
  personId: string,
  ministryId: string,
) {
  if (isSuperadmin(actor)) return;
  if (!canAccessMinistry(actor, ministryId) && !isSuperadmin(actor)) {
    // LG/staff without ministry: deny cross-ministry
    if (isLeaderGeneral(actor) || actor.ministryIds.length > 0) {
      throw new DomainError(
        DomainErrorCode.CROSS_MINISTRY_PROCESS_DENIED,
        "Fuera del Ministerio autorizado.",
      );
    }
  }
  if (isLeaderGeneral(actor) && canAccessMinistry(actor, ministryId)) return;
  if (actor.personId && actor.personId === personId) return;
  if (actor.personId && (await isDescendantOf(actor.personId, personId))) return;

  // Assigned consolidator / leader of cell membership
  const db = getDb();
  const [assigned] = await db
    .select({ id: personProcessProgress.id })
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.assignedLeaderPersonId, actor.personId ?? "00000000-0000-0000-0000-000000000000"),
      ),
    )
    .limit(1);
  if (assigned && actor.personId) return;

  if (actor.personId) {
    const [memberUnder] = await db
      .select({ id: cellMemberships.id })
      .from(cellMemberships)
      .innerJoin(cells, eq(cells.id, cellMemberships.cellId))
      .where(
        and(
          eq(cellMemberships.personId, personId),
          eq(cellMemberships.status, "active"),
          eq(cells.responsiblePersonId, actor.personId),
          sql`${cells.status} <> 'closed'`,
        ),
      )
      .limit(1);
    if (memberUnder) return;
  }

  throw new DomainError(
    DomainErrorCode.PROCESS_ACCESS_DENIED,
    "Fuera del subárbol / alcance pastoral autorizado.",
  );
}

async function getProgress(personId: string, processType: "consolidar" | "udv" | "destino") {
  const db = getDb();
  const [row] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, processType),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function appendEvent(params: {
  progressId: string;
  personId: string;
  processType: "consolidar" | "udv" | "destino";
  eventType: string;
  fromStatus?:
    | "pending"
    | "eligible"
    | "in_progress"
    | "academic_completed"
    | "completed"
    | "paused"
    | "abandoned"
    | null;
  toStatus?:
    | "pending"
    | "eligible"
    | "in_progress"
    | "academic_completed"
    | "completed"
    | "paused"
    | "abandoned"
    | null;
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
    fromStatus: params.fromStatus ?? null,
    toStatus: params.toStatus ?? null,
    actorUserId: params.actorUserId,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
  });
}

export async function ensureUdvProgram() {
  const db = getDb();
  let [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.code, UDV_PROGRAM_CODE))
    .limit(1);
  if (!program) {
    [program] = await db
      .insert(trainingPrograms)
      .values({
        code: UDV_PROGRAM_CODE,
        name: "Universidad de la Vida",
        description: "Programa pastoral previo a Capacitación Destino.",
        isActive: true,
      })
      .returning();
  }
  const modules = await db
    .select()
    .from(trainingModules)
    .where(eq(trainingModules.programId, program.id))
    .orderBy(asc(trainingModules.orderIndex));
  if (modules.length === 0) {
    const defaults = [
      { code: "M1", name: "Módulo 1", orderIndex: 1 },
      { code: "M2", name: "Módulo 2", orderIndex: 2 },
      { code: "M3", name: "Módulo 3", orderIndex: 3 },
      { code: "M4", name: "Módulo 4", orderIndex: 4 },
    ];
    await db.insert(trainingModules).values(
      defaults.map((m) => ({
        programId: program.id,
        code: m.code,
        name: m.name,
        orderIndex: m.orderIndex,
        isActive: true,
        isRequired: true,
      })),
    );
  }
  return program;
}

export async function startConsolidation(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = startConsolidationInputSchema.parse(raw);
  assertCanMutate(actor, "process.update", {
    type: "process",
    ministryId: input.ministryId,
    personId: input.personId,
  });

  const org = await currentOrg(input.personId);
  if (!org?.ministryId) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      "La persona necesita pertenencia organizacional en GANAR.",
    );
  }
  if (org.ministryId !== input.ministryId) {
    throw new DomainError(
      DomainErrorCode.CROSS_MINISTRY_PROCESS_DENIED,
      "Ministerio no coincide con la pertenencia actual.",
    );
  }
  await assertProcessAccess(actor, input.personId, org.ministryId);

  const existing = await getProgress(input.personId, "consolidar");
  if (existing?.status === "completed") {
    throw new DomainError(
      DomainErrorCode.CONSOLIDATION_ALREADY_COMPLETED,
      "Consolidar ya está completado.",
    );
  }
  if (existing?.status === "in_progress") {
    return existing;
  }

  const db = getDb();
  const assignedLeaderPersonId =
    input.assignedLeaderPersonId ?? actor.personId ?? null;

  if (existing) {
    // resume from paused/pending/abandoned
    const [row] = await db
      .update(personProcessProgress)
      .set({
        status: "in_progress",
        startedAt: existing.startedAt ?? new Date(),
        assignedLeaderPersonId:
          assignedLeaderPersonId ?? existing.assignedLeaderPersonId,
        networkId: org.networkId,
        currentStep: "seguimiento",
        updatedAt: new Date(),
      })
      .where(eq(personProcessProgress.id, existing.id))
      .returning();
    await appendEvent({
      progressId: row.id,
      personId: input.personId,
      processType: "consolidar",
      eventType: "started",
      fromStatus: existing.status,
      toStatus: "in_progress",
      actorUserId,
    });
    await writeAuditLog({
      actorUserId,
      action: "process.consolidation.started",
      entityType: "person_process_progress",
      entityId: row.id,
      metadata: { personId: input.personId, resumed: true },
    });
    return row;
  }

  const [row] = await db
    .insert(personProcessProgress)
    .values({
      personId: input.personId,
      processType: "consolidar",
      status: "in_progress",
      stage: "consolidar",
      currentStep: "inicio",
      ministryId: org.ministryId,
      networkId: org.networkId,
      assignedLeaderPersonId,
      startedAt: new Date(),
    })
    .returning();

  await appendEvent({
    progressId: row.id,
    personId: input.personId,
    processType: "consolidar",
    eventType: "started",
    fromStatus: null,
    toStatus: "in_progress",
    actorUserId,
  });
  await writeAuditLog({
    actorUserId,
    action: "process.consolidation.started",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId: input.personId },
  });
  return row;
}

export async function completeConsolidation(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = completeConsolidationInputSchema.parse(raw);
  const progress = await getProgress(input.personId, "consolidar");
  if (!progress) {
    throw new DomainError(DomainErrorCode.PROCESS_NOT_FOUND, "Consolidar no iniciado.");
  }
  assertCanMutate(actor, "consolidation.manage", {
    type: "process",
    ministryId: progress.ministryId,
    personId: input.personId,
  });
  await assertProcessAccess(actor, input.personId, progress.ministryId);

  if (progress.status === "completed") {
    // Idempotent: return existing + ensure UDV pending row
    await ensureUdvEligibleRow(progress.personId, progress.ministryId, progress.networkId);
    return progress;
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
    })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();

  await appendEvent({
    progressId: row.id,
    personId: input.personId,
    processType: "consolidar",
    eventType: "completed",
    fromStatus: progress.status,
    toStatus: "completed",
    actorUserId,
    note: input.note,
  });
  await writeAuditLog({
    actorUserId,
    action: "process.consolidation.completed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId: input.personId },
  });

  await ensureUdvEligibleRow(row.personId, row.ministryId, row.networkId);
  return row;
}

async function ensureUdvEligibleRow(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  const existing = await getProgress(personId, "udv");
  if (existing) return existing;
  const db = getDb();
  const [row] = await db
    .insert(personProcessProgress)
    .values({
      personId,
      processType: "udv",
      status: "pending",
      stage: "udv",
      currentStep: "apto",
      ministryId,
      networkId,
      metadata: { eligible_for_udv: true },
    })
    .returning();
  return row;
}

export async function pauseProcess(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = pauseProcessInputSchema.parse(raw);
  const progress = await getProgress(input.personId, input.processType);
  if (!progress) {
    throw new DomainError(DomainErrorCode.PROCESS_NOT_FOUND, "Proceso no encontrado.");
  }
  assertCanMutate(actor, "process.update", {
    type: "process",
    ministryId: progress.ministryId,
    personId: input.personId,
  });
  await assertProcessAccess(actor, input.personId, progress.ministryId);
  if (progress.status === "completed") {
    throw new DomainError(
      DomainErrorCode.CONFLICT,
      "No se puede pausar un proceso completado.",
    );
  }

  const db = getDb();
  const [row] = await db
    .update(personProcessProgress)
    .set({
      status: "paused",
      currentStep: progress.currentStep ?? "pausado",
      updatedAt: new Date(),
    })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();

  await appendEvent({
    progressId: row.id,
    personId: input.personId,
    processType: input.processType,
    eventType: "paused",
    fromStatus: progress.status,
    toStatus: "paused",
    actorUserId,
    note: input.note,
  });
  await writeAuditLog({
    actorUserId,
    action:
      input.processType === "consolidar"
        ? "process.consolidation.paused"
        : "process.udv.paused",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId: input.personId },
  });
  return row;
}

export async function resumeProcess(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = resumeProcessInputSchema.parse(raw);
  const progress = await getProgress(input.personId, input.processType);
  if (!progress) {
    throw new DomainError(DomainErrorCode.PROCESS_NOT_FOUND, "Proceso no encontrado.");
  }
  assertCanMutate(actor, "process.update", {
    type: "process",
    ministryId: progress.ministryId,
    personId: input.personId,
  });
  await assertProcessAccess(actor, input.personId, progress.ministryId);
  if (progress.status === "completed") {
    throw new DomainError(DomainErrorCode.CONFLICT, "El proceso ya está completado.");
  }
  if (progress.status === "in_progress") return progress;

  const db = getDb();
  const [row] = await db
    .update(personProcessProgress)
    .set({
      status: "in_progress",
      updatedAt: new Date(),
    })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();

  await appendEvent({
    progressId: row.id,
    personId: input.personId,
    processType: input.processType,
    eventType: "resumed",
    fromStatus: progress.status,
    toStatus: "in_progress",
    actorUserId,
  });
  return row;
}

export async function createTrainingCycle(actorUserId: string, raw: CreateCycleInput) {
  const actor = await requireActor(actorUserId);
  const input = createCycleInputSchema.parse(raw);
  assertCanMutate(actor, "school.cycles.manage", {
    type: "training",
    ministryId: input.ministryId ?? undefined,
  });

  const program = await ensureUdvProgram();
  const db = getDb();
  const [cycle] = await db
    .insert(trainingCycles)
    .values({
      programId: program.id,
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      status: "planned",
      ministryId: input.ministryId || null,
      createdByUserId: actorUserId,
    })
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "school.cycle.created",
    entityType: "training_cycle",
    entityId: cycle.id,
    metadata: { name: cycle.name, program: UDV_PROGRAM_CODE },
  });
  return cycle;
}

export async function activateTrainingCycle(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, cycleId))
    .limit(1);
  if (!cycle) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ciclo no encontrado.");
  }
  assertCanMutate(actor, "school.cycles.manage", {
    type: "training",
    ministryId: cycle.ministryId ?? undefined,
  });
  if (cycle.status === "active") {
    throw new DomainError(DomainErrorCode.CYCLE_ALREADY_ACTIVE, "El ciclo ya está activo.");
  }
  if (cycle.status === "closed") {
    throw new DomainError(DomainErrorCode.CYCLE_ALREADY_CLOSED, "El ciclo está cerrado.");
  }

  const [updated] = await db
    .update(trainingCycles)
    .set({ status: "active", activatedAt: new Date(), updatedAt: new Date() })
    .where(eq(trainingCycles.id, cycleId))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "school.cycle.activated",
    entityType: "training_cycle",
    entityId: updated.id,
    metadata: { name: updated.name },
  });
  return updated;
}

export async function closeTrainingCycle(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, cycleId))
    .limit(1);
  if (!cycle) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ciclo no encontrado.");
  }
  assertCanMutate(actor, "school.cycles.manage", {
    type: "training",
    ministryId: cycle.ministryId ?? undefined,
  });
  if (cycle.status === "closed") {
    throw new DomainError(DomainErrorCode.CYCLE_ALREADY_CLOSED, "El ciclo ya está cerrado.");
  }
  const [updated] = await db
    .update(trainingCycles)
    .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(eq(trainingCycles.id, cycleId))
    .returning();
  return updated;
}

export async function enrollInUdv(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = enrollUdvInputSchema.parse(raw);
  const consolidar = await getProgress(input.personId, "consolidar");
  if (!consolidar || consolidar.status !== "completed") {
    throw new DomainError(
      DomainErrorCode.CONSOLIDATION_REQUIRED,
      "Debe completar Consolidar antes de Universidad de la Vida.",
    );
  }
  assertCanMutate(actor, "udv.manage", {
    type: "training",
    ministryId: consolidar.ministryId,
    personId: input.personId,
  });
  await assertProcessAccess(actor, input.personId, consolidar.ministryId);

  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, input.cycleId))
    .limit(1);
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.UDV_CYCLE_NOT_ACTIVE,
      "Solo se puede inscribir en un ciclo activo.",
    );
  }

  const udvProgress = await getProgress(input.personId, "udv");
  if (udvProgress?.status === "completed") {
    throw new DomainError(
      DomainErrorCode.UDV_ALREADY_COMPLETED,
      "UDV ya está completada.",
    );
  }

  const [existingEnroll] = await db
    .select()
    .from(trainingEnrollments)
    .where(
      and(
        eq(trainingEnrollments.cycleId, input.cycleId),
        eq(trainingEnrollments.personId, input.personId),
      ),
    )
    .limit(1);
  if (existingEnroll) {
    throw new DomainError(
      DomainErrorCode.UDV_ALREADY_ENROLLED,
      "La persona ya está inscrita en este ciclo.",
    );
  }

  const [enrollment] = await db
    .insert(trainingEnrollments)
    .values({
      cycleId: input.cycleId,
      personId: input.personId,
      status: "in_progress",
    })
    .returning();

  // Upsert UDV progress to in_progress
  let progress = udvProgress;
  if (!progress) {
    progress = await ensureUdvEligibleRow(
      input.personId,
      consolidar.ministryId,
      consolidar.networkId,
    );
  }
  const [updatedProgress] = await db
    .update(personProcessProgress)
    .set({
      status: "in_progress",
      startedAt: progress.startedAt ?? new Date(),
      currentStep: "cursando",
      updatedAt: new Date(),
      metadata: { ...(progress.metadata ?? {}), cycleId: cycle.id },
    })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();

  await appendEvent({
    progressId: updatedProgress.id,
    personId: input.personId,
    processType: "udv",
    eventType: "enrolled",
    fromStatus: progress.status,
    toStatus: "in_progress",
    actorUserId,
    metadata: { cycleId: cycle.id, enrollmentId: enrollment.id },
  });
  await writeAuditLog({
    actorUserId,
    action: "process.udv.enrolled",
    entityType: "training_enrollment",
    entityId: enrollment.id,
    metadata: { personId: input.personId, cycleId: cycle.id },
  });

  return { enrollment, progress: updatedProgress };
}

export async function recordTrainingAttendance(
  actorUserId: string,
  raw: RecordAttendanceInput,
) {
  const actor = await requireActor(actorUserId);
  const input = recordAttendanceInputSchema.parse(raw);
  if (
    !hasPermission(actor, "udv.attendance") &&
    !hasPermission(actor, "destination.attendance") &&
    !hasPermission(actor, "ministerial_school.attendance") &&
    !hasPermission(actor, "reencounter.attendance")
  ) {
    throw new DomainError(
      DomainErrorCode.NOT_AUTHORIZED,
      "Sin permiso de asistencia formativa.",
    );
  }

  const db = getDb();
  const [enrollment] = await db
    .select()
    .from(trainingEnrollments)
    .where(eq(trainingEnrollments.id, input.enrollmentId))
    .limit(1);
  if (!enrollment) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Inscripción no encontrada.");
  }

  const consolidar = await getProgress(enrollment.personId, "consolidar");
  const ministryId = consolidar?.ministryId;
  if (ministryId) {
    await assertProcessAccess(actor, enrollment.personId, ministryId);
  }

  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, enrollment.cycleId))
    .limit(1);
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.UDV_CYCLE_NOT_ACTIVE,
      "El ciclo no admite ediciones ordinarias.",
    );
  }

  const [module] = await db
    .select()
    .from(trainingModules)
    .where(eq(trainingModules.id, input.moduleId))
    .limit(1);
  if (!module || !module.isActive) {
    throw new DomainError(
      DomainErrorCode.TRAINING_MODULE_INACTIVE,
      "Módulo inactivo o inexistente.",
    );
  }

  const [existing] = await db
    .select()
    .from(trainingAttendance)
    .where(
      and(
        eq(trainingAttendance.enrollmentId, input.enrollmentId),
        eq(trainingAttendance.moduleId, input.moduleId),
      ),
    )
    .limit(1);

  if (existing) {
    if (input.status === "recovered") {
      throw new DomainError(
        DomainErrorCode.ATTENDANCE_RECOVERY_NOT_AUTHORIZED,
        "Use la operación de recuperación autorizada.",
      );
    }
    // Update non-recovery statuses (present/absent/excused) — keep history via audit
    const [updated] = await db
      .update(trainingAttendance)
      .set({
        status: input.status,
        attendanceDate: input.attendanceDate,
        recordedByUserId: actorUserId,
        recordedAt: new Date(),
        notes: input.notes ?? existing.notes,
      })
      .where(eq(trainingAttendance.id, existing.id))
      .returning();
    await writeAuditLog({
      actorUserId,
      action: "school.attendance.recorded",
      entityType: "training_attendance",
      entityId: updated.id,
      metadata: {
        enrollmentId: enrollment.id,
        moduleId: input.moduleId,
        status: input.status,
        updated: true,
      },
    });
    return updated;
  }

  if (input.status === "recovered") {
    throw new DomainError(
      DomainErrorCode.ATTENDANCE_RECOVERY_NOT_AUTHORIZED,
      "No hay ausencia previa para recuperar.",
    );
  }

  const [row] = await db
    .insert(trainingAttendance)
    .values({
      enrollmentId: input.enrollmentId,
      moduleId: input.moduleId,
      attendanceDate: input.attendanceDate,
      status: input.status,
      recordedByUserId: actorUserId,
      notes: input.notes ?? null,
    })
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "school.attendance.recorded",
    entityType: "training_attendance",
    entityId: row.id,
    metadata: {
      enrollmentId: enrollment.id,
      moduleId: input.moduleId,
      status: input.status,
    },
  });
  return row;
}

export async function authorizeAttendanceRecovery(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = authorizeRecoveryInputSchema.parse(raw);
  if (
    !hasPermission(actor, "udv.attendance") &&
    !hasPermission(actor, "destination.attendance") &&
    !hasPermission(actor, "ministerial_school.attendance") &&
    !hasPermission(actor, "reencounter.attendance")
  ) {
    throw new DomainError(
      DomainErrorCode.NOT_AUTHORIZED,
      "Sin permiso de asistencia formativa.",
    );
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(trainingAttendance)
    .where(eq(trainingAttendance.id, input.attendanceId))
    .limit(1);
  if (!row) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Asistencia no encontrada.");
  }
  if (row.status !== "absent" && row.status !== "excused") {
    throw new DomainError(
      DomainErrorCode.ATTENDANCE_RECOVERY_NOT_AUTHORIZED,
      "Solo se recuperan ausencias o justificados.",
    );
  }

  const [enrollment] = await db
    .select()
    .from(trainingEnrollments)
    .where(eq(trainingEnrollments.id, row.enrollmentId))
    .limit(1);
  if (enrollment) {
    const consolidar = await getProgress(enrollment.personId, "consolidar");
    if (consolidar) {
      await assertProcessAccess(actor, enrollment.personId, consolidar.ministryId);
    }
  }

  const [updated] = await db
    .update(trainingAttendance)
    .set({
      status: "recovered",
      recoveryAuthorizedByUserId: actorUserId,
      recoveryAuthorizedAt: new Date(),
      recoveryNote: input.note?.trim() || null,
      recordedAt: new Date(),
    })
    .where(eq(trainingAttendance.id, row.id))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "school.attendance.recovery_authorized",
    entityType: "training_attendance",
    entityId: updated.id,
    metadata: {
      previousStatus: row.status,
      enrollmentId: row.enrollmentId,
      moduleId: row.moduleId,
    },
  });
  return updated;
}

export async function completeUdv(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = completeUdvInputSchema.parse(raw);
  const progress = await getProgress(input.personId, "udv");
  if (!progress) {
    throw new DomainError(DomainErrorCode.UDV_NOT_ELIGIBLE, "UDV no iniciada.");
  }
  assertCanMutate(actor, "udv.manage", {
    type: "training",
    ministryId: progress.ministryId,
    personId: input.personId,
  });
  await assertProcessAccess(actor, input.personId, progress.ministryId);

  if (progress.status === "completed") {
    const { ensureDestinoN1Eligible } = await import("./destination");
    await ensureDestinoN1Eligible(
      input.personId,
      progress.ministryId,
      progress.networkId,
    );
    return { progress, nextStageEligible: true, leadershipActivated: false };
  }

  const consolidar = await getProgress(input.personId, "consolidar");
  if (!consolidar || consolidar.status !== "completed") {
    throw new DomainError(
      DomainErrorCode.CONSOLIDATION_REQUIRED,
      "Consolidar debe estar completado.",
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
      metadata: {
        ...(progress.metadata ?? {}),
        next_stage_eligible: true,
        eligible_for_destination: true,
      },
      updatedAt: new Date(),
    })
    .where(eq(personProcessProgress.id, progress.id))
    .returning();

  // Mark open UDV enrollments completed (scoped via program when possible)
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
        eq(trainingEnrollments.personId, input.personId),
        inArray(trainingEnrollments.status, ["enrolled", "in_progress"]),
      ),
    );

  // Legacy aggregate signal + concrete Destino Nivel 1 eligibility
  const destino = await getProgress(input.personId, "destino");
  if (!destino) {
    await db.insert(personProcessProgress).values({
      personId: input.personId,
      processType: "destino",
      status: "pending",
      stage: "destino",
      currentStep: "NEXT_STAGE_ELIGIBLE",
      ministryId: progress.ministryId,
      networkId: progress.networkId,
      metadata: { eligible_for_destination: true },
    });
  }

  const { ensureDestinoN1Eligible } = await import("./destination");
  await ensureDestinoN1Eligible(
    input.personId,
    progress.ministryId,
    progress.networkId,
  );

  await appendEvent({
    progressId: row.id,
    personId: input.personId,
    processType: "udv",
    eventType: "completed",
    fromStatus: progress.status,
    toStatus: "completed",
    actorUserId,
    note: input.note,
    metadata: { next_stage_eligible: true },
  });
  await writeAuditLog({
    actorUserId,
    action: "process.udv.completed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: {
      personId: input.personId,
      next_stage_eligible: true,
      leadership_activated: false,
    },
  });

  return { progress: row, nextStageEligible: true, leadershipActivated: false };
}

export function isEligibleForDestination(progress: {
  processType: string;
  status: string;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (progress.processType === "destino" && progress.status === "pending") {
    return true;
  }
  if (progress.processType === "udv" && progress.status === "completed") {
    return Boolean(progress.metadata?.eligible_for_destination ?? true);
  }
  return false;
}

export async function getPersonLadder(actorUserId: string, personId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read") && !hasPermission(actor, "persons.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const org = await currentOrg(personId);
  if (org?.ministryId) {
    await assertProcessAccess(actor, personId, org.ministryId);
  } else if (!isSuperadmin(actor)) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin pertenencia/org.");
  }

  const consolidar = await getProgress(personId, "consolidar");
  const udv = await getProgress(personId, "udv"); // legacy only — not a gate
  const { getPersonConsolidarSummary } = await import("./consolidar-stages");
  const { getPersonDestinoSummary } = await import("./destination");
  const { getPersonEmLevelsSummary } = await import("./em-levels");
  const { getPersonReencuentroSummary } = await import("./reencounter");

  const consolidarStages = await getPersonConsolidarSummary(personId);
  const destinoLevels = await getPersonDestinoSummary(personId);
  const emLevels = await getPersonEmLevelsSummary(personId);
  const reencuentro = await getPersonReencuentroSummary(personId);

  const consolidarDone = consolidar?.status === "completed";
  const n1Done = destinoLevels.n1.status === "completed";
  const n2Done = destinoLevels.n2.status === "completed";
  const n3Done = destinoLevels.n3.status === "completed";
  const reDone = reencuentro.status === "completed";
  const em1Done = emLevels.em1.status === "completed";
  const em2Done = emLevels.em2.status === "completed";
  const em3Done = emLevels.em3.status === "completed";

  // Official next-step resolution (no UDV gate; RE between CD2 and CD3)
  let nextCode = "pre_encuentro";
  let nextLabel = "Pre-Encuentro";
  let nextEligible = true;

  if (consolidarStages.pre.status !== "completed") {
    nextCode = "pre_encuentro";
    nextLabel = "Pre-Encuentro";
    nextEligible = true;
  } else if (consolidarStages.encuentro.status !== "completed") {
    nextCode = "encuentro";
    nextLabel = "Encuentro";
    nextEligible = true;
  } else if (consolidarStages.post.status !== "completed") {
    nextCode = "post_encuentro";
    nextLabel = "Post-Encuentro";
    nextEligible = true;
  } else if (consolidarDone && !n1Done) {
    nextCode = "destino_n1";
    nextLabel = "Capacitación Destino 1";
    nextEligible = true;
  } else if (n1Done && !n2Done) {
    nextCode = "destino_n2";
    nextLabel = "Capacitación Destino 2";
    nextEligible = true;
  } else if (n2Done && !reDone) {
    nextCode = "reencuentro";
    nextLabel = "Re-Encuentro";
    nextEligible = true;
  } else if (n2Done && reDone && !n3Done) {
    nextCode = "destino_n3";
    nextLabel = "Capacitación Destino 3";
    nextEligible = true;
  } else if (n3Done && !em1Done) {
    nextCode = "em1";
    nextLabel = "Escuela Ministerial 1";
    nextEligible = true;
  } else if (em1Done && !em2Done) {
    nextCode = "em2";
    nextLabel = "Escuela Ministerial 2";
    nextEligible = true;
  } else if (em2Done && !em3Done) {
    nextCode = "em3";
    nextLabel = "Escuela Ministerial 3";
    nextEligible = true;
  } else if (em3Done) {
    nextCode = "enviar";
    nextLabel = "Enviar";
    nextEligible = true;
  }

  const { getPersonSendSummary } = await import("@/modules/send/service");
  const enviar = await getPersonSendSummary(personId);
  if (enviar.status === "completed") {
    nextCode = "enviar";
    nextLabel = "Enviar completado";
    nextEligible = false;
  } else if (enviar.status === "in_progress" || enviar.status === "eligible") {
    nextCode = "enviar";
    nextLabel = "Enviar";
    nextEligible = true;
  }

  return {
    personId,
    ganar: { status: "completed" as const, label: "Completado" },
    consolidar: {
      status: consolidar?.status ?? consolidarStages.consolidar.status,
      label: statusLabel(consolidar?.status ?? consolidarStages.consolidar.status),
      progress: consolidar,
      stages: consolidarStages,
    },
    /** @deprecated UDV is not an official gate; kept for legacy display only */
    udv: {
      status: udv?.status ?? "pending",
      label: statusLabel(udv?.status ?? "pending"),
      progress: udv,
      eligible: false,
      legacy: true as const,
    },
    discipular: {
      cd1: destinoLevels.n1,
      cd2: destinoLevels.n2,
      reencuentro,
      cd3: destinoLevels.n3,
      em1: emLevels.em1,
      em2: emLevels.em2,
      em3: emLevels.em3,
    },
    destino: {
      n1: destinoLevels.n1,
      n2: destinoLevels.n2,
      n3: destinoLevels.n3,
    },
    escuelaMinisterial: emLevels.em1,
    emLevels,
    reencuentro,
    next: {
      code: nextCode,
      label: nextLabel,
      eligible: nextEligible,
      implemented: true,
    },
    enviar,
  };
}

export function statusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "eligible":
      return "Apto";
    case "in_progress":
      return "En curso";
    case "academic_completed":
      return "Académico completado";
    case "completed":
      return "Completado";
    case "paused":
      return "Pausado";
    case "abandoned":
      return "Abandonado";
    default:
      return status;
  }
}

export async function getProcessDashboardCounts(
  actorUserId: string,
  focusLeaderPersonId?: string | null,
) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();

  const conditions = [];
  if (isSuperadmin(actor)) {
    // no filter
  } else if (isLeaderGeneral(actor) && actor.ministryIds.length) {
    conditions.push(inArray(personProcessProgress.ministryId, actor.ministryIds));
  } else if (focusLeaderPersonId || actor.personId) {
    const root = focusLeaderPersonId ?? actor.personId!;
    conditions.push(
      sql`${personProcessProgress.personId} IN (
        SELECT descendant_person_id FROM leadership_closure
        WHERE ancestor_person_id = ${root}::uuid
      ) OR ${personProcessProgress.assignedLeaderPersonId} = ${root}::uuid`,
    );
  } else if (actor.ministryIds.length) {
    conditions.push(inArray(personProcessProgress.ministryId, actor.ministryIds));
  } else {
    return emptyOfficialDashboardCounts();
  }

  const where =
    conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = await db
    .select({
      processType: personProcessProgress.processType,
      status: personProcessProgress.status,
      c: count(),
    })
    .from(personProcessProgress)
    .where(where)
    .groupBy(personProcessProgress.processType, personProcessProgress.status);

  const pick = (type: string, statuses: string[]) =>
    Number(
      rows
        .filter((r) => r.processType === type && statuses.includes(r.status))
        .reduce((acc, r) => acc + Number(r.c), 0),
    );
  const pickOne = (type: string, status: string) => pick(type, [status]);

  return {
    consolidarPending: pickOne("consolidar", "pending"),
    consolidarInProgress: pickOne("consolidar", "in_progress"),
    consolidarCompleted: pickOne("consolidar", "completed"),
    // Official stage counts
    preEncuentro: pick("pre_encuentro", ["eligible", "in_progress", "academic_completed"]),
    encuentro: pick("encuentro", ["eligible", "in_progress", "academic_completed"]),
    postEncuentro: pick("post_encuentro", ["eligible", "in_progress", "academic_completed"]),
    cd1: pick("destino_n1", ["eligible", "in_progress", "academic_completed"]),
    cd2: pick("destino_n2", ["eligible", "in_progress", "academic_completed"]),
    reencuentro: pick("reencuentro", ["eligible", "in_progress", "academic_completed"]),
    cd3: pick("destino_n3", ["eligible", "in_progress", "academic_completed"]),
    em1: pick("em1", ["eligible", "in_progress", "academic_completed"]),
    em2: pick("em2", ["eligible", "in_progress", "academic_completed"]),
    em3: pick("em3", ["eligible", "in_progress", "academic_completed"]),
    // Aptos (eligible status)
    aptosEncuentro: pickOne("encuentro", "eligible"),
    aptosPostEncuentro: pickOne("post_encuentro", "eligible"),
    aptosCd1: pickOne("destino_n1", "eligible"),
    aptosCd2: pickOne("destino_n2", "eligible"),
    aptosReencuentro: pickOne("reencuentro", "eligible"),
    aptosCd3: pickOne("destino_n3", "eligible"),
    aptosEm1: pickOne("em1", "eligible"),
    aptosEm2: pickOne("em2", "eligible"),
    aptosEm3: pickOne("em3", "eligible"),
    // Legacy UDV (not a gate)
    udvEligible: pickOne("udv", "pending"),
    udvInProgress: pickOne("udv", "in_progress"),
    udvCompleted: pickOne("udv", "completed"),
  };
}

function emptyOfficialDashboardCounts() {
  return {
    consolidarPending: 0,
    consolidarInProgress: 0,
    consolidarCompleted: 0,
    preEncuentro: 0,
    encuentro: 0,
    postEncuentro: 0,
    cd1: 0,
    cd2: 0,
    reencuentro: 0,
    cd3: 0,
    em1: 0,
    em2: 0,
    em3: 0,
    aptosEncuentro: 0,
    aptosPostEncuentro: 0,
    aptosCd1: 0,
    aptosCd2: 0,
    aptosReencuentro: 0,
    aptosCd3: 0,
    aptosEm1: 0,
    aptosEm2: 0,
    aptosEm3: 0,
    udvEligible: 0,
    udvInProgress: 0,
    udvCompleted: 0,
  };
}

export async function listProcessPeople(
  actorUserId: string,
  filters: {
    processType?: "consolidar" | "udv";
    status?: string;
    ministryId?: string;
    networkId?: string;
    leaderPersonId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 40, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.processType) {
    conditions.push(eq(personProcessProgress.processType, filters.processType));
  }
  if (filters.status) {
    conditions.push(
      eq(
        personProcessProgress.status,
        filters.status as "pending" | "in_progress" | "completed" | "paused" | "abandoned",
      ),
    );
  }
  if (filters.ministryId) {
    if (!isSuperadmin(actor) && !canAccessMinistry(actor, filters.ministryId)) {
      throw new DomainError(
        DomainErrorCode.CROSS_MINISTRY_PROCESS_DENIED,
        "Ministerio fuera de alcance.",
      );
    }
    conditions.push(eq(personProcessProgress.ministryId, filters.ministryId));
  } else if (!isSuperadmin(actor) && actor.ministryIds.length) {
    conditions.push(inArray(personProcessProgress.ministryId, actor.ministryIds));
  }
  if (filters.networkId) {
    conditions.push(eq(personProcessProgress.networkId, filters.networkId));
  }
  if (filters.leaderPersonId) {
    conditions.push(
      eq(personProcessProgress.assignedLeaderPersonId, filters.leaderPersonId),
    );
  } else if (!isSuperadmin(actor) && !isLeaderGeneral(actor) && actor.personId) {
    conditions.push(
      sql`(${personProcessProgress.assignedLeaderPersonId} = ${actor.personId}::uuid
        OR ${personProcessProgress.personId} IN (
          SELECT descendant_person_id FROM leadership_closure
          WHERE ancestor_person_id = ${actor.personId}::uuid
        ))`,
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select({
      progress: personProcessProgress,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(personProcessProgress)
    .innerJoin(persons, eq(persons.id, personProcessProgress.personId))
    .where(where)
    .orderBy(desc(personProcessProgress.updatedAt))
    .limit(pageSize)
    .offset(offset);

  return rows.map((r) => ({
    ...r.progress,
    fullName: formatFullName(r.firstName, r.lastName),
    statusLabel: statusLabel(r.progress.status),
  }));
}

export async function listUdvCycles(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "udv.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  await ensureUdvProgram();
  const db = getDb();
  return db.select().from(trainingCycles).orderBy(desc(trainingCycles.startDate));
}

export async function getUdvCycleBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "udv.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, cycleId))
    .limit(1);
  if (!cycle) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ciclo no encontrado.");
  }

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

  // Filter by tree scope for non-LG/non-admin
  const scoped = [];
  for (const row of enrollments) {
    try {
      const consolidar = await getProgress(row.enrollment.personId, "consolidar");
      if (consolidar) {
        await assertProcessAccess(actor, row.enrollment.personId, consolidar.ministryId);
      } else if (!isSuperadmin(actor) && !isLeaderGeneral(actor)) {
        continue;
      }
      scoped.push(row);
    } catch {
      // skip out-of-scope
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

export async function getPersonsProcessSummary(personIds: string[]) {
  if (personIds.length === 0) return {};
  const db = getDb();
  const rows = await db
    .select()
    .from(personProcessProgress)
    .where(inArray(personProcessProgress.personId, personIds));
  const map: Record<
    string,
    {
      consolidar?: string;
      preEncuentro?: string;
      encuentro?: string;
      postEncuentro?: string;
      udv?: string;
      destinoLabel?: string;
      destinoN1?: string;
      destinoN2?: string;
      destinoN3?: string;
      emStatus?: string;
      em1?: string;
      em2?: string;
      em3?: string;
      reencuentroStatus?: string;
      compactLabel?: string;
    }
  > = {};
  for (const row of rows) {
    map[row.personId] ??= {};
    if (row.processType === "consolidar") map[row.personId].consolidar = row.status;
    if (row.processType === "pre_encuentro") map[row.personId].preEncuentro = row.status;
    if (row.processType === "encuentro") map[row.personId].encuentro = row.status;
    if (row.processType === "post_encuentro") map[row.personId].postEncuentro = row.status;
    if (row.processType === "udv") map[row.personId].udv = row.status;
    if (row.processType === "destino_n1") map[row.personId].destinoN1 = row.status;
    if (row.processType === "destino_n2") map[row.personId].destinoN2 = row.status;
    if (row.processType === "destino_n3") map[row.personId].destinoN3 = row.status;
    if (row.processType === "escuela_ministerial") map[row.personId].emStatus = row.status;
    if (row.processType === "em1") map[row.personId].em1 = row.status;
    if (row.processType === "em2") map[row.personId].em2 = row.status;
    if (row.processType === "em3") map[row.personId].em3 = row.status;
    if (row.processType === "reencuentro") map[row.personId].reencuentroStatus = row.status;
  }
  for (const personId of Object.keys(map)) {
    const entry = map[personId]!;
    // Compact summary: prefer deepest official stage
    if (entry.em3 && entry.em3 !== "pending") {
      entry.compactLabel = `Discipular: EM3 ${statusLabel(entry.em3)}`;
    } else if (entry.em2 && entry.em2 !== "pending") {
      entry.compactLabel = `Discipular: EM2 ${statusLabel(entry.em2)}`;
    } else if (entry.em1 && entry.em1 !== "pending") {
      entry.compactLabel = `Discipular: EM1 ${statusLabel(entry.em1)}`;
    } else if (entry.destinoN3 && entry.destinoN3 !== "pending") {
      entry.destinoLabel = `CD3 — ${statusLabel(entry.destinoN3)}`;
      entry.compactLabel = `Discipular: CD3`;
    } else if (entry.reencuentroStatus && entry.reencuentroStatus !== "pending") {
      entry.compactLabel =
        entry.reencuentroStatus === "eligible"
          ? "Discipular: Re-Encuentro apto"
          : `Discipular: Re-Encuentro`;
    } else if (entry.destinoN2 && entry.destinoN2 !== "pending") {
      entry.destinoLabel = `CD2 — ${statusLabel(entry.destinoN2)}`;
      entry.compactLabel = `Discipular: CD2`;
    } else if (entry.destinoN1 && entry.destinoN1 !== "pending") {
      entry.destinoLabel = `CD1 — ${statusLabel(entry.destinoN1)}`;
      entry.compactLabel = `Discipular: CD1`;
    } else if (entry.consolidar === "completed") {
      entry.compactLabel = "Consolidar: completado";
    } else if (entry.postEncuentro && entry.postEncuentro !== "pending") {
      entry.compactLabel = `Consolidar: Post-Encuentro`;
    } else if (entry.encuentro && entry.encuentro !== "pending") {
      entry.compactLabel = `Consolidar: Encuentro`;
    } else if (entry.preEncuentro && entry.preEncuentro !== "pending") {
      entry.compactLabel = `Consolidar: Pre-Encuentro`;
    } else if (entry.consolidar) {
      entry.compactLabel = `Consolidar: ${statusLabel(entry.consolidar)}`;
    }
  }
  return map;
}

/** Pure helpers for unit tests */
export const FormationRules = {
  /** @deprecated UDV is not an official gate; legacy compat only */
  canEnterUdv(consolidarStatus: string | null | undefined) {
    return consolidarStatus === "completed";
  },
  completingUdvActivatesLeader() {
    return false;
  },
  /** @deprecated Official next after consolidar is CD1, not UDV */
  nextStageEligibleAfterUdv(udvStatus: string) {
    return udvStatus === "completed";
  },
  /** Official: Consolidar completed → CD1 eligible (UDV never gates). */
  consolidarEnablesCd1(consolidarStatus: string | null | undefined) {
    return consolidarStatus === "completed";
  },
  udvIsNotGateBeforeCd1: true as const,
  duplicateEnrollmentBlocked(alreadyEnrolled: boolean) {
    return alreadyEnrolled;
  },
};
