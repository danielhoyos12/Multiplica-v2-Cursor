/**
 * Re-Encuentro — post Escuela Ministerial.
 * Modeled as training program with a single event module (RE-EVENT).
 * Completing does NOT activate leadership / create cell / credentials.
 */
import type { Id } from "../../../convex/_generated/dataModel";
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
import { assertProcessAccess, statusLabel } from "@/modules/formation/service";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

const PROCESS = "reencuentro" as const;
const REENCUENTRO_FAMILY = "reencuentro";
const REENCUENTRO_PROGRAM_CODE = "reencuentro";
const EVENT_MODULE_CODE = "RE-EVENT";

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

async function getReProgress(personId: string) {
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: PROCESS,
  });
  return row ? withId(row) : null;
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
  const client = await getAuthenticatedConvexClient();
  await client
    .mutation(api.formation.appendProcessEvent, {
      progressId: params.progressId as Id<"personProcessProgress">,
      personId: params.personId as Id<"persons">,
      processType: PROCESS,
      eventType: params.eventType,
      fromStatus: (params.fromStatus ?? undefined) as never,
      toStatus: (params.toStatus ?? undefined) as never,
      note: params.note ?? undefined,
      metadata: params.metadata ?? {},
    })
    .catch(mapConvexError);
}

export async function ensureReencuentroProgram() {
  const client = await getAuthenticatedConvexClient();
  const program = await client.mutation(api.formation.ensureProgram, {
    code: REENCUENTRO_PROGRAM_CODE,
    name: "Re-Encuentro",
    description: "Evento pastoral posterior a Escuela Ministerial (módulo único).",
    family: REENCUENTRO_FAMILY,
  });
  const modules = await client.query(api.formation.listModules, { programId: program._id });
  if (modules.length === 0) {
    await client.mutation(api.formation.syncModules, {
      programId: program._id,
      modules: [
        { code: EVENT_MODULE_CODE, name: "Evento Re-Encuentro", orderIndex: 1 },
      ],
    });
  }
  return withId(program);
}

export async function ensureReencuentroEligible(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  const existing = await getReProgress(personId);
  if (existing && existing.status !== "pending") return existing;
  const client = await getAuthenticatedConvexClient();
  return withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: personId as Id<"persons">,
        processType: PROCESS,
        status: "eligible",
        stage: "reencuentro",
        currentStep: "apto_reencuentro",
        ministryId: ministryId as Id<"ministries">,
        networkId: (networkId ?? undefined) as Id<"networks"> | undefined,
        metadata: { ...(existing?.metadata ?? {}), eligible_for_reencuentro: true },
      })
      .catch(mapConvexError),
  );
}

export async function assertReencuentroEligible(personId: string) {
  const client = await getAuthenticatedConvexClient();
  const cd2 = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: "destino_n2",
  });
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
  const client = await getAuthenticatedConvexClient();
  const program = await client.query(api.formation.getProgramByCode, {
    code: REENCUENTRO_PROGRAM_CODE,
  });
  if (!program) {
    throw new DomainError(
      DomainErrorCode.CONFIGURATION_ERROR,
      "Programa Re-Encuentro no configurado.",
    );
  }
  return withId(program);
}

async function assertCycleStaffOrManage(actor: AuthContext, cycleId: string) {
  if (isSuperadmin(actor)) return;
  if (hasPermission(actor, "reencounter.manage") || hasPermission(actor, "school.cycles.manage")) {
    return;
  }
  const client = await getAuthenticatedConvexClient();
  const staff = await client.query(api.formation.getCycleStaff, {
    cycleId: cycleId as Id<"trainingCycles">,
    userId: actor.userId as Id<"users">,
  });
  if (!staff) {
    throw new DomainError(
      DomainErrorCode.REENCOUNTER_ACCESS_DENIED,
      "No eres staff asignado a este evento.",
    );
  }
}

export async function createReencuentroEvent(
  actorUserId: string,
  raw: { name: string; startDate: string; endDate: string; ministryId?: string | null },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "school.cycles.manage", {
    type: "training",
    ministryId: raw.ministryId ?? undefined,
  });
  const program = await getProgram();
  const client = await getAuthenticatedConvexClient();
  const cycle = withId(
    await client.mutation(api.formation.createCycle, {
      programId: program.id as Id<"trainingPrograms">,
      name: raw.name.trim(),
      startDate: raw.startDate,
      endDate: raw.endDate,
      ministryId: (raw.ministryId || undefined) as Id<"ministries"> | undefined,
    }),
  );
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
  assertCanMutate(actor, "reencounter.manage", { type: "training", personId: raw.personId });
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
  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: raw.cycleId as Id<"trainingCycles">,
  });
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

  const existing = await client.query(api.formation.getEnrollmentByCycleAndPerson, {
    cycleId: raw.cycleId as Id<"trainingCycles">,
    personId: raw.personId as Id<"persons">,
  });
  if (existing) {
    throw new DomainError(
      DomainErrorCode.REENCOUNTER_ALREADY_ENROLLED,
      "Ya inscrito en este evento.",
    );
  }

  const enrollment = withId(
    await client
      .mutation(api.formation.enroll, {
        cycleId: raw.cycleId as Id<"trainingCycles">,
        personId: raw.personId as Id<"persons">,
      })
      .catch(mapConvexError),
  );

  const updatedProgress = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: PROCESS,
        status: "in_progress",
        stage: "reencuentro",
        currentStep: "inscrito",
        ministryId: org.ministryId as Id<"ministries">,
        networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
        startedAt: progress?.startedAt ?? Date.now(),
        metadata: { ...(progress?.metadata ?? {}), cycleId: cycle._id },
      })
      .catch(mapConvexError),
  );

  await appendEvent({
    progressId: updatedProgress.id,
    personId: raw.personId,
    eventType: "enrolled",
    fromStatus: progress?.status ?? null,
    toStatus: "in_progress",
    actorUserId,
    metadata: { cycleId: cycle._id, enrollmentId: enrollment.id },
  });
  await writeAuditLog({
    actorUserId,
    action: "reencounter.enrolled",
    entityType: "training_enrollment",
    entityId: enrollment.id,
    metadata: { personId: raw.personId, cycleId: cycle._id },
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
  if (!hasPermission(actor, "reencounter.attendance") && !hasPermission(actor, "reencounter.manage")) {
    throw new DomainError(DomainErrorCode.REENCOUNTER_ACCESS_DENIED, "Sin permiso.");
  }

  const client = await getAuthenticatedConvexClient();
  const enrollment = await client.query(api.formation.getEnrollment, {
    enrollmentId: raw.enrollmentId as Id<"trainingEnrollments">,
  });
  if (!enrollment) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Inscripción no encontrada.");
  }
  await assertCycleStaffOrManage(actor, enrollment.cycleId);

  const org = await currentOrg(enrollment.personId);
  if (org?.ministryId) {
    await assertProcessAccess(actor, enrollment.personId, org.ministryId);
  }

  const cycle = await client.query(api.formation.getCycle, { cycleId: enrollment.cycleId });
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(DomainErrorCode.REENCOUNTER_EVENT_NOT_ACTIVE, "Evento no activo.");
  }

  const modules = await client.query(api.formation.listModules, { programId: cycle.programId });
  const trainingModule = modules.find((m) => m.code === EVENT_MODULE_CODE);
  if (!trainingModule) {
    throw new DomainError(DomainErrorCode.TRAINING_MODULE_INACTIVE, "Módulo evento ausente.");
  }

  const row = withId(
    await client
      .mutation(api.formation.recordAttendance, {
        enrollmentId: raw.enrollmentId as Id<"trainingEnrollments">,
        moduleId: trainingModule._id,
        attendanceDate: raw.attendanceDate,
        status: raw.status,
        recordedByUserId: actorUserId as Id<"users">,
        notes: raw.notes || undefined,
      })
      .catch(mapConvexError),
  );

  await writeAuditLog({
    actorUserId,
    action: "reencounter.attendance_recorded",
    entityType: "training_attendance",
    entityId: row.id,
    metadata: { enrollmentId: raw.enrollmentId, status: raw.status },
  });
  return row;
}

export async function completeReencuentro(
  actorUserId: string,
  raw: { personId: string; enrollmentId?: string; note?: string },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "reencounter.complete", { type: "training", personId: raw.personId });
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

  const client = await getAuthenticatedConvexClient();
  if (raw.enrollmentId) {
    const enrollment = await client.query(api.formation.getEnrollment, {
      enrollmentId: raw.enrollmentId as Id<"trainingEnrollments">,
    });
    if (enrollment) {
      await assertCycleStaffOrManage(actor, enrollment.cycleId);
      await client.mutation(api.formation.updateEnrollmentStatus, {
        enrollmentId: enrollment._id,
        status: "completed",
        completedByUserId: actorUserId as Id<"users">,
      });
    }
  }

  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: PROCESS,
        status: "completed",
        currentStep: "completado",
        completedAt: Date.now(),
        completedByUserId: actorUserId as Id<"users">,
        metadata: {
          ...(progress.metadata ?? {}),
          formally_completed: true,
          next_stage: "destino_n3",
          leadership_activated: false,
        },
      })
      .catch(mapConvexError),
  );

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

  const cd3 = await client.query(api.formation.getProgress, {
    personId: raw.personId as Id<"persons">,
    processType: "destino_n3",
  });
  if (!cd3) {
    await client.mutation(api.formation.upsertProgress, {
      personId: raw.personId as Id<"persons">,
      processType: "destino_n3",
      status: "eligible",
      stage: "n3",
      currentStep: "apto_n3",
      ministryId: org.ministryId as Id<"ministries">,
      networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
      metadata: { eligible_from: "reencuentro" },
    });
  } else if (cd3.status === "pending") {
    await client.mutation(api.formation.upsertProgress, {
      personId: raw.personId as Id<"persons">,
      processType: "destino_n3",
      status: "eligible",
      currentStep: "apto_n3",
    });
  }

  await writeAuditLog({
    actorUserId,
    action: "reencounter.next_stage_eligible",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId: raw.personId, nextStage: "destino_n3", implemented: true },
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
  const client = await getAuthenticatedConvexClient();
  const rows = await client.query(api.formation.listProgressRows, {
    processTypes: ["destino_n2"],
    statuses: ["completed"],
  });
  const result = [];
  for (const row of rows) {
    const p = row.progress;
    if (!isSuperadmin(actor) && !canAccessMinistry(actor, p.ministryId)) continue;
    try {
      await assertProcessAccess(actor, p.personId, p.ministryId);
    } catch {
      continue;
    }
    const re = await getReProgress(p.personId);
    if (re?.status === "completed") continue;
    result.push({
      personId: p.personId as string,
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
  const client = await getAuthenticatedConvexClient();
  const ministryIds =
    !isSuperadmin(actor) && actor.ministryIds.length
      ? (actor.ministryIds as Id<"ministries">[])
      : undefined;
  const rows = await client.query(api.formation.listProgressRows, {
    processTypes: [PROCESS],
    ministryIds,
  });
  const pick = (statuses: string[]) =>
    rows.filter((r) => statuses.includes(r.progress.status)).length;
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
  const client = await getAuthenticatedConvexClient();
  const cycles = await client.query(api.formation.listCycles, {
    programIds: [program.id as Id<"trainingPrograms">],
  });
  return cycles.map(withId);
}

export async function getReencuentroEventBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "reencounter.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.REENCOUNTER_ACCESS_DENIED, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });
  if (!cycle) throw new DomainError(DomainErrorCode.NOT_FOUND, "Evento no encontrado.");
  const program = await client.query(api.formation.getProgramByCode, {
    code: REENCUENTRO_PROGRAM_CODE,
  });
  const modules = (await client.query(api.formation.listModules, { programId: cycle.programId })).map(
    withId,
  );
  const enrollments = await client.query(api.formation.listEnrollmentsByCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });

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
  const enrollmentIds = scoped.map((s) => s.enrollment._id);
  const attendanceRows =
    enrollmentIds.length === 0
      ? []
      : await client.query(api.formation.listAttendanceByEnrollments, { enrollmentIds });
  const eventModule = modules.find((m) => m.code === EVENT_MODULE_CODE) ?? modules[0];

  return {
    cycle: withId(cycle),
    program: program ? withId(program) : null,
    eventModule,
    participants: scoped.map((s) => {
      const att = eventModule
        ? attendanceRows.find(
            (a) => a.enrollmentId === s.enrollment._id && a.moduleId === (eventModule.id as unknown),
          )
        : undefined;
      return {
        enrollmentId: s.enrollment._id as string,
        personId: s.enrollment.personId as string,
        fullName: formatFullName(s.firstName, s.lastName),
        status: s.enrollment.status,
        attendanceStatus: att?.status ?? null,
        attendanceId: (att?._id as string | undefined) ?? null,
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
        completedAt: re.completedAt ?? null,
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
