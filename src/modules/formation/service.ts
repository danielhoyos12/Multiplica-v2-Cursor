/**
 * Formation / Escalera del Éxito — Consolidar + Universidad de la Vida.
 * Persona Maestra (persons.id) is the only identity. No person silos.
 */
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { withId } from "@/lib/convex-doc";
import { mapConvexError } from "@/lib/convex-errors";
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
import { UDV_PROGRAM_CODE } from "@/db/schema";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

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

type ProcessStatus =
  | "pending"
  | "eligible"
  | "in_progress"
  | "academic_completed"
  | "completed"
  | "paused"
  | "abandoned";

async function requireActor(userId: string) {
  return loadAuthContext(userId);
}

async function currentOrg(personId: string) {
  const client = await getAuthenticatedConvexClient();
  const org = await client.query(api.persons.getCurrentOrg, {
    personId: personId as Id<"persons">,
  });
  if (!org) return null;
  return {
    ministryId: (org.ministryId as string | undefined) ?? null,
    networkId: (org.networkId as string | undefined) ?? null,
  };
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

  const client = await getAuthenticatedConvexClient();

  // Assigned consolidator / leader of cell membership
  if (actor.personId) {
    const assigned = await client.query(api.formation.hasAssignedProgress, {
      personId: personId as Id<"persons">,
      assignedLeaderPersonId: actor.personId as Id<"persons">,
    });
    if (assigned) return;

    const memberUnder = await client.query(api.formation.isPersonInActiveCellUnder, {
      personId: personId as Id<"persons">,
      responsiblePersonId: actor.personId as Id<"persons">,
    });
    if (memberUnder) return;
  }

  throw new DomainError(
    DomainErrorCode.PROCESS_ACCESS_DENIED,
    "Fuera del subárbol / alcance pastoral autorizado.",
  );
}

async function getProgress(personId: string, processType: "consolidar" | "udv" | "destino") {
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType,
  });
  return row ? withId(row) : null;
}

async function appendEvent(params: {
  progressId: string;
  personId: string;
  processType: "consolidar" | "udv" | "destino";
  eventType: string;
  fromStatus?: ProcessStatus | null;
  toStatus?: ProcessStatus | null;
  actorUserId: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const client = await getAuthenticatedConvexClient();
  await client
    .mutation(api.formation.appendProcessEvent, {
      progressId: params.progressId as Id<"personProcessProgress">,
      personId: params.personId as Id<"persons">,
      processType: params.processType,
      eventType: params.eventType,
      fromStatus: (params.fromStatus ?? undefined) as never,
      toStatus: (params.toStatus ?? undefined) as never,
      note: params.note ?? undefined,
      metadata: params.metadata ?? {},
    })
    .catch(mapConvexError);
}

export async function ensureUdvProgram() {
  const client = await getAuthenticatedConvexClient();
  const program = withId(
    await client.mutation(api.formation.ensureProgram, {
      code: UDV_PROGRAM_CODE,
      name: "Universidad de la Vida",
      description: "Programa pastoral previo a Capacitación Destino.",
    }),
  );
  const modules = await client.query(api.formation.listModules, {
    programId: program.id as Id<"trainingPrograms">,
  });
  if (modules.length === 0) {
    await client.mutation(api.formation.syncModules, {
      programId: program.id as Id<"trainingPrograms">,
      modules: [
        { code: "M1", name: "Módulo 1", orderIndex: 1 },
        { code: "M2", name: "Módulo 2", orderIndex: 2 },
        { code: "M3", name: "Módulo 3", orderIndex: 3 },
        { code: "M4", name: "Módulo 4", orderIndex: 4 },
      ],
    });
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

  const client = await getAuthenticatedConvexClient();
  const assignedLeaderPersonId = input.assignedLeaderPersonId ?? actor.personId ?? undefined;

  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: input.personId as Id<"persons">,
        processType: "consolidar",
        status: "in_progress",
        stage: existing ? undefined : "consolidar",
        currentStep: existing ? "seguimiento" : "inicio",
        ministryId: org.ministryId as Id<"ministries">,
        networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
        assignedLeaderPersonId: assignedLeaderPersonId as Id<"persons"> | undefined,
        startedAt: existing?.startedAt ?? Date.now(),
      })
      .catch(mapConvexError),
  );

  await appendEvent({
    progressId: row.id,
    personId: input.personId,
    processType: "consolidar",
    eventType: "started",
    fromStatus: existing?.status ?? null,
    toStatus: "in_progress",
    actorUserId,
  });
  await writeAuditLog({
    actorUserId,
    action: "process.consolidation.started",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId: input.personId, resumed: Boolean(existing) },
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
    await ensureUdvEligibleRow(progress.personId, progress.ministryId, progress.networkId ?? null);
    return progress;
  }

  const client = await getAuthenticatedConvexClient();
  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: input.personId as Id<"persons">,
        processType: "consolidar",
        status: "completed",
        currentStep: "completado",
        completedAt: Date.now(),
        completedByUserId: actorUserId as Id<"users">,
      })
      .catch(mapConvexError),
  );

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

  await ensureUdvEligibleRow(row.personId, row.ministryId, row.networkId ?? null);
  return row;
}

async function ensureUdvEligibleRow(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  const existing = await getProgress(personId, "udv");
  if (existing) return existing;
  const client = await getAuthenticatedConvexClient();
  return withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: personId as Id<"persons">,
        processType: "udv",
        status: "pending",
        stage: "udv",
        currentStep: "apto",
        ministryId: ministryId as Id<"ministries">,
        networkId: (networkId ?? undefined) as Id<"networks"> | undefined,
        metadata: { eligible_for_udv: true },
      })
      .catch(mapConvexError),
  );
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

  const client = await getAuthenticatedConvexClient();
  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: input.personId as Id<"persons">,
        processType: input.processType,
        status: "paused",
        currentStep: progress.currentStep ?? "pausado",
      })
      .catch(mapConvexError),
  );

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

  const client = await getAuthenticatedConvexClient();
  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: input.personId as Id<"persons">,
        processType: input.processType,
        status: "in_progress",
      })
      .catch(mapConvexError),
  );

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
  const client = await getAuthenticatedConvexClient();
  const cycle = withId(
    await client
      .mutation(api.formation.createCycle, {
        programId: program.id as Id<"trainingPrograms">,
        name: input.name.trim(),
        startDate: input.startDate,
        endDate: input.endDate,
        ministryId: (input.ministryId || undefined) as Id<"ministries"> | undefined,
      })
      .catch(mapConvexError),
  );

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
  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });
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

  const updated = withId(
    await client
      .mutation(api.formation.activateCycle, { cycleId: cycleId as Id<"trainingCycles"> })
      .catch(mapConvexError),
  );

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
  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });
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
  return withId(
    await client
      .mutation(api.formation.closeCycle, { cycleId: cycleId as Id<"trainingCycles"> })
      .catch(mapConvexError),
  );
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

  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: input.cycleId as Id<"trainingCycles">,
  });
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.UDV_CYCLE_NOT_ACTIVE,
      "Solo se puede inscribir en un ciclo activo.",
    );
  }

  const udvProgress = await getProgress(input.personId, "udv");
  if (udvProgress?.status === "completed") {
    throw new DomainError(DomainErrorCode.UDV_ALREADY_COMPLETED, "UDV ya está completada.");
  }

  const existingEnroll = await client.query(api.formation.getEnrollmentByCycleAndPerson, {
    cycleId: input.cycleId as Id<"trainingCycles">,
    personId: input.personId as Id<"persons">,
  });
  if (existingEnroll) {
    throw new DomainError(
      DomainErrorCode.UDV_ALREADY_ENROLLED,
      "La persona ya está inscrita en este ciclo.",
    );
  }

  const enrollment = withId(
    await client
      .mutation(api.formation.enroll, {
        cycleId: input.cycleId as Id<"trainingCycles">,
        personId: input.personId as Id<"persons">,
      })
      .catch(mapConvexError),
  );

  // Upsert UDV progress to in_progress
  let progress = udvProgress;
  if (!progress) {
    progress = await ensureUdvEligibleRow(
      input.personId,
      consolidar.ministryId,
      consolidar.networkId ?? null,
    );
  }
  const updatedProgress = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: input.personId as Id<"persons">,
        processType: "udv",
        status: "in_progress",
        currentStep: "cursando",
        startedAt: progress.startedAt ?? Date.now(),
        metadata: { ...(progress.metadata ?? {}), cycleId: cycle._id },
      })
      .catch(mapConvexError),
  );

  await appendEvent({
    progressId: updatedProgress.id,
    personId: input.personId,
    processType: "udv",
    eventType: "enrolled",
    fromStatus: progress.status,
    toStatus: "in_progress",
    actorUserId,
    metadata: { cycleId: cycle._id, enrollmentId: enrollment.id },
  });
  await writeAuditLog({
    actorUserId,
    action: "process.udv.enrolled",
    entityType: "training_enrollment",
    entityId: enrollment.id,
    metadata: { personId: input.personId, cycleId: cycle._id },
  });

  return { enrollment, progress: updatedProgress };
}

export async function recordTrainingAttendance(actorUserId: string, raw: RecordAttendanceInput) {
  const actor = await requireActor(actorUserId);
  const input = recordAttendanceInputSchema.parse(raw);
  if (
    !hasPermission(actor, "udv.attendance") &&
    !hasPermission(actor, "destination.attendance") &&
    !hasPermission(actor, "ministerial_school.attendance") &&
    !hasPermission(actor, "reencounter.attendance")
  ) {
    throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Sin permiso de asistencia formativa.");
  }

  const client = await getAuthenticatedConvexClient();
  const enrollment = await client.query(api.formation.getEnrollment, {
    enrollmentId: input.enrollmentId as Id<"trainingEnrollments">,
  });
  if (!enrollment) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Inscripción no encontrada.");
  }

  const consolidar = await getProgress(enrollment.personId as string, "consolidar");
  const ministryId = consolidar?.ministryId;
  if (ministryId) {
    await assertProcessAccess(actor, enrollment.personId as string, ministryId);
  }

  const cycle = await client.query(api.formation.getCycle, { cycleId: enrollment.cycleId });
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.UDV_CYCLE_NOT_ACTIVE,
      "El ciclo no admite ediciones ordinarias.",
    );
  }

  const trainingModules = await client.query(api.formation.listModules, {
    programId: cycle.programId,
  });
  const trainingModule = trainingModules.find((m) => m._id === input.moduleId);
  if (!trainingModule || !trainingModule.isActive) {
    throw new DomainError(
      DomainErrorCode.TRAINING_MODULE_INACTIVE,
      "Módulo inactivo o inexistente.",
    );
  }

  const existing = await client.query(api.formation.getAttendance, {
    enrollmentId: input.enrollmentId as Id<"trainingEnrollments">,
    moduleId: input.moduleId as Id<"trainingModules">,
  });

  if (existing) {
    if (input.status === "recovered") {
      throw new DomainError(
        DomainErrorCode.ATTENDANCE_RECOVERY_NOT_AUTHORIZED,
        "Use la operación de recuperación autorizada.",
      );
    }
    const updated = withId(
      await client
        .mutation(api.formation.recordAttendance, {
          enrollmentId: input.enrollmentId as Id<"trainingEnrollments">,
          moduleId: input.moduleId as Id<"trainingModules">,
          attendanceDate: input.attendanceDate,
          status: input.status,
          recordedByUserId: actorUserId as Id<"users">,
          notes: input.notes || existing.notes,
        })
        .catch(mapConvexError),
    );
    await writeAuditLog({
      actorUserId,
      action: "school.attendance.recorded",
      entityType: "training_attendance",
      entityId: updated.id,
      metadata: {
        enrollmentId: enrollment._id,
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

  const row = withId(
    await client
      .mutation(api.formation.recordAttendance, {
        enrollmentId: input.enrollmentId as Id<"trainingEnrollments">,
        moduleId: input.moduleId as Id<"trainingModules">,
        attendanceDate: input.attendanceDate,
        status: input.status,
        recordedByUserId: actorUserId as Id<"users">,
        notes: input.notes || undefined,
      })
      .catch(mapConvexError),
  );

  await writeAuditLog({
    actorUserId,
    action: "school.attendance.recorded",
    entityType: "training_attendance",
    entityId: row.id,
    metadata: {
      enrollmentId: enrollment._id,
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
    throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Sin permiso de asistencia formativa.");
  }

  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.formation.getAttendanceById, {
    attendanceId: input.attendanceId as Id<"trainingAttendance">,
  });
  if (!row) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Asistencia no encontrada.");
  }
  if (row.status !== "absent" && row.status !== "excused") {
    throw new DomainError(
      DomainErrorCode.ATTENDANCE_RECOVERY_NOT_AUTHORIZED,
      "Solo se recuperan ausencias o justificados.",
    );
  }

  const enrollment = await client.query(api.formation.getEnrollment, {
    enrollmentId: row.enrollmentId,
  });
  if (enrollment) {
    const consolidar = await getProgress(enrollment.personId as string, "consolidar");
    if (consolidar) {
      await assertProcessAccess(actor, enrollment.personId as string, consolidar.ministryId);
    }
  }

  const updated = withId(
    await client
      .mutation(api.formation.authorizeRecovery, {
        attendanceId: row._id,
        note: input.note?.trim() || undefined,
      })
      .catch(mapConvexError),
  );

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
    await ensureDestinoN1Eligible(input.personId, progress.ministryId, progress.networkId ?? null);
    return { progress, nextStageEligible: true, leadershipActivated: false };
  }

  const consolidar = await getProgress(input.personId, "consolidar");
  if (!consolidar || consolidar.status !== "completed") {
    throw new DomainError(DomainErrorCode.CONSOLIDATION_REQUIRED, "Consolidar debe estar completado.");
  }

  const client = await getAuthenticatedConvexClient();
  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: input.personId as Id<"persons">,
        processType: "udv",
        status: "completed",
        currentStep: "completado",
        completedAt: Date.now(),
        completedByUserId: actorUserId as Id<"users">,
        metadata: {
          ...(progress.metadata ?? {}),
          next_stage_eligible: true,
          eligible_for_destination: true,
        },
      })
      .catch(mapConvexError),
  );

  // Mark open UDV enrollments completed
  await client.mutation(api.formation.bulkCompleteEnrollmentsForPerson, {
    personId: input.personId as Id<"persons">,
    completedByUserId: actorUserId as Id<"users">,
  });

  // Legacy aggregate signal + concrete Destino Nivel 1 eligibility
  const destino = await getProgress(input.personId, "destino");
  if (!destino) {
    await client.mutation(api.formation.upsertProgress, {
      personId: input.personId as Id<"persons">,
      processType: "destino",
      status: "pending",
      stage: "destino",
      currentStep: "NEXT_STAGE_ELIGIBLE",
      ministryId: progress.ministryId as Id<"ministries">,
      networkId: (progress.networkId ?? undefined) as Id<"networks"> | undefined,
      metadata: { eligible_for_destination: true },
    });
  }

  const { ensureDestinoN1Eligible } = await import("./destination");
  await ensureDestinoN1Eligible(input.personId, progress.ministryId, progress.networkId ?? null);

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
  const client = await getAuthenticatedConvexClient();

  const allProcessTypes = [
    "consolidar",
    "pre_encuentro",
    "encuentro",
    "post_encuentro",
    "destino_n1",
    "destino_n2",
    "reencuentro",
    "destino_n3",
    "em1",
    "em2",
    "em3",
    "udv",
  ] as const;

  let ministryIds: Id<"ministries">[] | undefined;
  let assignedLeaderPersonId: Id<"persons"> | undefined;
  let personIds: Id<"persons">[] | undefined;

  if (isSuperadmin(actor)) {
    // no filter
  } else if (isLeaderGeneral(actor) && actor.ministryIds.length) {
    ministryIds = actor.ministryIds as Id<"ministries">[];
  } else if (focusLeaderPersonId || actor.personId) {
    const root = (focusLeaderPersonId ?? actor.personId!) as Id<"persons">;
    const descendants = await client.query(api.formation.getDescendantPersonIds, {
      rootPersonId: root,
    });
    personIds = [root, ...descendants];
    assignedLeaderPersonId = root;
  } else if (actor.ministryIds.length) {
    ministryIds = actor.ministryIds as Id<"ministries">[];
  } else {
    return emptyOfficialDashboardCounts();
  }

  let rows: Array<{ progress: { processType: string; status: string; personId: Id<"persons">; assignedLeaderPersonId?: Id<"persons"> } }>;
  if (personIds) {
    const [byPerson, byAssignedLeader] = await Promise.all([
      client.query(api.formation.listProgressRows, {
        processTypes: [...allProcessTypes],
        personIds,
      }),
      assignedLeaderPersonId
        ? client.query(api.formation.listProgressRows, {
            processTypes: [...allProcessTypes],
            assignedLeaderPersonId,
          })
        : Promise.resolve([]),
    ]);
    const seen = new Set<string>();
    rows = [];
    for (const row of [...byPerson, ...byAssignedLeader]) {
      const key = `${row.progress.personId}:${row.progress.processType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  } else {
    rows = await client.query(api.formation.listProgressRows, {
      processTypes: [...allProcessTypes],
      ministryIds,
    });
  }

  const pick = (type: string, statuses: string[]) =>
    rows.filter((r) => r.progress.processType === type && statuses.includes(r.progress.status)).length;
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
  const client = await getAuthenticatedConvexClient();
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 40, 100);
  const offset = (page - 1) * pageSize;

  if (filters.ministryId && !isSuperadmin(actor) && !canAccessMinistry(actor, filters.ministryId)) {
    throw new DomainError(
      DomainErrorCode.CROSS_MINISTRY_PROCESS_DENIED,
      "Ministerio fuera de alcance.",
    );
  }

  let ministryIds: Id<"ministries">[] | undefined;
  if (filters.ministryId) {
    ministryIds = [filters.ministryId as Id<"ministries">];
  } else if (!isSuperadmin(actor) && actor.ministryIds.length) {
    ministryIds = actor.ministryIds as Id<"ministries">[];
  }

  let assignedLeaderPersonId: Id<"persons"> | undefined;
  let treeScopedIds: Id<"persons">[] | undefined;
  if (filters.leaderPersonId) {
    assignedLeaderPersonId = filters.leaderPersonId as Id<"persons">;
  } else if (!isSuperadmin(actor) && !isLeaderGeneral(actor) && actor.personId) {
    const descendants = await client.query(api.formation.getDescendantPersonIds, {
      rootPersonId: actor.personId as Id<"persons">,
    });
    treeScopedIds = [actor.personId as Id<"persons">, ...descendants];
    assignedLeaderPersonId = actor.personId as Id<"persons">;
  }

  let rows: Array<{ progress: Doc<"personProcessProgress">; firstName: string; lastName: string }>;

  if (treeScopedIds) {
    const [byTree, byAssignedLeader] = await Promise.all([
      client.query(api.formation.listProgressRows, { personIds: treeScopedIds }),
      client.query(api.formation.listProgressRows, { assignedLeaderPersonId }),
    ]);
    const seen = new Set<string>();
    rows = [];
    for (const row of [...byTree, ...byAssignedLeader]) {
      const key = `${row.progress.personId}:${row.progress.processType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  } else {
    rows = await client.query(api.formation.listProgressRows, {
      ministryIds,
      assignedLeaderPersonId,
    });
    // `listProgressRows` prioritizes assignedLeaderPersonId over ministryIds
    // internally — re-apply the ministry filter here so both stay ANDed.
    if (ministryIds && assignedLeaderPersonId) {
      const ministrySet = new Set(ministryIds);
      rows = rows.filter((r) => ministrySet.has(r.progress.ministryId));
    }
  }

  if (filters.processType) {
    rows = rows.filter((r) => r.progress.processType === filters.processType);
  }
  if (filters.status) {
    rows = rows.filter((r) => r.progress.status === filters.status);
  }
  if (filters.networkId) {
    rows = rows.filter((r) => r.progress.networkId === filters.networkId);
  }
  if (ministryIds && treeScopedIds) {
    const ministrySet = new Set(ministryIds);
    rows = rows.filter((r) => ministrySet.has(r.progress.ministryId));
  }

  rows.sort((a, b) => b.progress.updatedAt - a.progress.updatedAt);
  const paged = rows.slice(offset, offset + pageSize);

  return paged.map((r) => ({
    ...withId(r.progress),
    fullName: formatFullName(r.firstName, r.lastName),
    statusLabel: statusLabel(r.progress.status),
  }));
}

export async function listUdvCycles(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "udv.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const program = await ensureUdvProgram();
  const client = await getAuthenticatedConvexClient();
  const cycles = await client.query(api.formation.listCycles, {
    programIds: [program.id as Id<"trainingPrograms">],
  });
  return cycles.map(withId);
}

export async function getUdvCycleBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "udv.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });
  if (!cycle) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ciclo no encontrado.");
  }

  const modules = (
    await client.query(api.formation.listModules, { programId: cycle.programId, activeOnly: true })
  ).map(withId);

  const enrollments = await client.query(api.formation.listEnrollmentsByCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });

  // Filter by tree scope for non-LG/non-admin
  const scoped = [];
  for (const row of enrollments) {
    try {
      const consolidar = await getProgress(row.enrollment.personId as string, "consolidar");
      if (consolidar) {
        await assertProcessAccess(actor, row.enrollment.personId as string, consolidar.ministryId);
      } else if (!isSuperadmin(actor) && !isLeaderGeneral(actor)) {
        continue;
      }
      scoped.push(row);
    } catch {
      // skip out-of-scope
    }
  }

  const enrollmentIds = scoped.map((s) => s.enrollment._id);
  const attendanceRows =
    enrollmentIds.length === 0
      ? []
      : await client.query(api.formation.listAttendanceByEnrollments, { enrollmentIds });

  return {
    cycle: withId(cycle),
    modules,
    participants: scoped.map((s) => ({
      enrollmentId: s.enrollment._id as string,
      personId: s.enrollment.personId as string,
      fullName: formatFullName(s.firstName, s.lastName),
      status: s.enrollment.status,
      attendance: Object.fromEntries(
        attendanceRows
          .filter((a) => a.enrollmentId === s.enrollment._id)
          .map((a) => [a.moduleId as string, withId(a)]),
      ),
    })),
  };
}

export async function getPersonsProcessSummary(personIds: string[]) {
  if (personIds.length === 0) return {};
  const client = await getAuthenticatedConvexClient();
  const rows = await client.query(api.formation.listProgressByPersons, {
    personIds: personIds as Id<"persons">[],
  });
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
    const personId = row.personId as string;
    map[personId] ??= {};
    if (row.processType === "consolidar") map[personId].consolidar = row.status;
    if (row.processType === "pre_encuentro") map[personId].preEncuentro = row.status;
    if (row.processType === "encuentro") map[personId].encuentro = row.status;
    if (row.processType === "post_encuentro") map[personId].postEncuentro = row.status;
    if (row.processType === "udv") map[personId].udv = row.status;
    if (row.processType === "destino_n1") map[personId].destinoN1 = row.status;
    if (row.processType === "destino_n2") map[personId].destinoN2 = row.status;
    if (row.processType === "destino_n3") map[personId].destinoN3 = row.status;
    if (row.processType === "escuela_ministerial") map[personId].emStatus = row.status;
    if (row.processType === "em1") map[personId].em1 = row.status;
    if (row.processType === "em2") map[personId].em2 = row.status;
    if (row.processType === "em3") map[personId].em3 = row.status;
    if (row.processType === "reencuentro") map[personId].reencuentroStatus = row.status;
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
