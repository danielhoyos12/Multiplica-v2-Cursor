/**
 * Escuela Ministerial — post Destino N3.
 * Reuses training_* + person_process_*. Never creates person silos or auto-leadership.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { withId } from "@/lib/convex-doc";
import { mapConvexError } from "@/lib/convex-errors";
import { EM_FAMILY, EM_PROGRAM_CODE } from "@/db/schema";
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

const PROCESS = "escuela_ministerial" as const;

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

async function getEmProgress(personId: string) {
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: PROCESS,
  });
  return row ? withId(row) : null;
}

async function getDestinoN3(personId: string) {
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: "destino_n3",
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

export async function ensureEmProgram() {
  const client = await getAuthenticatedConvexClient();
  const program = withId(
    await client
      .mutation(api.formation.ensureProgram, {
        code: EM_PROGRAM_CODE,
        name: "Escuela Ministerial",
        description: "Formación posterior a Capacitación Destino.",
        family: EM_FAMILY,
      })
      .catch(mapConvexError),
  );

  const modules = await client.query(api.formation.listModules, {
    programId: program.id as Id<"trainingPrograms">,
  });
  if (modules.length === 0) {
    await client
      .mutation(api.formation.syncModules, {
        programId: program.id as Id<"trainingPrograms">,
        modules: [1, 2, 3, 4].map((n) => ({
          code: `EM-M${n}`,
          name: `Módulo ${n}`,
          orderIndex: n,
          isRequired: true,
        })),
      })
      .catch(mapConvexError);
  }

  const reqs = await client.query(api.formation.listRequirements, {
    programId: program.id as Id<"trainingPrograms">,
  });
  if (reqs.length === 0) {
    await client
      .mutation(api.formation.syncRequirements, {
        programId: program.id as Id<"trainingPrograms">,
        requirements: [
          {
            requirementType: "manual_approval",
            category: "academic",
            label: "Componente académico aprobado",
            isRequired: true,
          },
        ],
      })
      .catch(mapConvexError);
  }
  return program;
}

export async function ensureEmEligible(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  const existing = await getEmProgress(personId);
  const client = await getAuthenticatedConvexClient();
  if (existing) {
    if (existing.status === "pending") {
      return withId(
        await client
          .mutation(api.formation.upsertProgress, {
            personId: personId as Id<"persons">,
            processType: PROCESS,
            status: "eligible",
            currentStep: "apto_em",
            metadata: { ...(existing.metadata ?? {}), eligible_for_em: true },
          })
          .catch(mapConvexError),
      );
    }
    return existing;
  }
  return withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: personId as Id<"persons">,
        processType: PROCESS,
        status: "eligible",
        stage: "em",
        currentStep: "apto_em",
        ministryId: ministryId as Id<"ministries">,
        networkId: (networkId ?? undefined) as Id<"networks"> | undefined,
        metadata: { eligible_for_em: true },
      })
      .catch(mapConvexError),
  );
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
  const client = await getAuthenticatedConvexClient();
  const program = await client.query(api.formation.getProgramByCode, { code: EM_PROGRAM_CODE });
  if (!program) {
    throw new DomainError(DomainErrorCode.CONFIGURATION_ERROR, "Programa EM no configurado.");
  }
  return withId(program);
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
  const client = await getAuthenticatedConvexClient();
  const staff = await client.query(api.formation.getCycleStaff, {
    cycleId: cycleId as Id<"trainingCycles">,
    userId: actor.userId as Id<"users">,
  });
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
  const client = await getAuthenticatedConvexClient();
  const requirements = (
    await client.query(api.formation.listRequirements, { programId: program.id as Id<"trainingPrograms"> })
  ).filter((r) => r.isActive && r.isRequired);
  const overrides = await client.query(api.formation.listOverrides, {
    personId: personId as Id<"persons">,
    programId: program.id as Id<"trainingPrograms">,
  });
  const overriddenIds = new Set(overrides.map((o) => o.requirementId).filter(Boolean));
  const progress = await getEmProgress(personId);
  const academicDone =
    progress?.status === "academic_completed" || progress?.status === "completed";

  const results = [];
  for (const req of requirements) {
    if (overriddenIds.has(req._id)) {
      results.push({
        requirementId: req._id,
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
        requirementId: req._id,
        type: req.requirementType,
        category: req.category,
        label: req.label ?? "Componente académico",
        passed: academicDone,
        overridden: false,
      });
      continue;
    }
    results.push({
      requirementId: req._id,
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
  const client = await getAuthenticatedConvexClient();
  const cycle = withId(
    await client
      .mutation(api.formation.createCycle, {
        programId: program.id as Id<"trainingPrograms">,
        name: raw.name.trim(),
        startDate: raw.startDate,
        endDate: raw.endDate,
        ministryId: (raw.ministryId || undefined) as Id<"ministries"> | undefined,
      })
      .catch(mapConvexError),
  );
  await writeAuditLog({
    actorUserId,
    action: "school.cycle.created",
    entityType: "training_cycle",
    entityId: cycle.id,
    metadata: { program: EM_PROGRAM_CODE },
  });
  return cycle;
}

export async function enrollEm(actorUserId: string, raw: { personId: string; cycleId: string }) {
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
  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: raw.cycleId as Id<"trainingCycles">,
  });
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_CYCLE_NOT_ACTIVE,
      "Solo ciclos activos admiten inscripción.",
    );
  }
  if (cycle.programId !== (program.id as Id<"trainingPrograms">)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Ciclo no es Escuela Ministerial.");
  }

  const progress = await getEmProgress(raw.personId);
  if (progress?.status === "completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ALREADY_COMPLETED,
      "EM ya completada.",
    );
  }

  const existing = await client.query(api.formation.getEnrollmentByCycleAndPerson, {
    cycleId: raw.cycleId as Id<"trainingCycles">,
    personId: raw.personId as Id<"persons">,
  });
  if (existing) {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ALREADY_ENROLLED,
      "Ya inscrito en este ciclo.",
    );
  }

  const enrollment = withId(
    await client
      .mutation(api.formation.enroll, {
        cycleId: raw.cycleId as Id<"trainingCycles">,
        personId: raw.personId as Id<"persons">,
        status: "in_progress",
      })
      .catch(mapConvexError),
  );

  const updatedProgress = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: PROCESS,
        status: "in_progress",
        stage: progress ? undefined : "em",
        currentStep: "cursando",
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
    action: "ministerial_school.enrolled",
    entityType: "training_enrollment",
    entityId: enrollment.id,
    metadata: { personId: raw.personId, cycleId: cycle._id },
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

  const client = await getAuthenticatedConvexClient();
  if (raw.enrollmentId) {
    const enrollment = await client.query(api.formation.getEnrollment, {
      enrollmentId: raw.enrollmentId as Id<"trainingEnrollments">,
    });
    if (enrollment) {
      await assertCycleStaffOrManage(actor, enrollment.cycleId, "academic");
      await client
        .mutation(api.formation.updateEnrollmentStatus, {
          enrollmentId: enrollment._id,
          status: "academic_completed",
        })
        .catch(mapConvexError);
    }
  }

  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: PROCESS,
        status: "academic_completed",
        currentStep: "academic_completed",
        metadata: {
          ...(progress.metadata ?? {}),
          academic_completed_at: new Date().toISOString(),
        },
      })
      .catch(mapConvexError),
  );

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

  const client = await getAuthenticatedConvexClient();
  if (raw.overrideRequirementIds?.length) {
    if (!hasPermission(actor, "destination.override_requirement") && !isSuperadmin(actor)) {
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
    for (const requirementId of raw.overrideRequirementIds) {
      await client
        .mutation(api.formation.insertOverride, {
          personId: raw.personId as Id<"persons">,
          programId: program.id as Id<"trainingPrograms">,
          requirementId: requirementId as Id<"trainingCompletionRequirements">,
          reason: raw.overrideReason.trim(),
        })
        .catch(mapConvexError);
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

  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: PROCESS,
        status: "completed",
        completedAt: Date.now(),
        completedByUserId: actorUserId as Id<"users">,
        currentStep: "completado",
        metadata: {
          ...(progress.metadata ?? {}),
          formally_completed: true,
          leadership_activated: false,
        },
      })
      .catch(mapConvexError),
  );

  const program = await getEmProgram();
  const cycles = await client.query(api.formation.listCycles, {
    programIds: [program.id as Id<"trainingPrograms">],
  });
  const cycleIds = cycles.map((c) => c._id);
  if (cycleIds.length) {
    await client
      .mutation(api.formation.bulkCompleteEnrollmentsForPerson, {
        personId: raw.personId as Id<"persons">,
        cycleIds,
        completedByUserId: actorUserId as Id<"users">,
      })
      .catch(mapConvexError);
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
  const client = await getAuthenticatedConvexClient();
  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: personId as Id<"persons">,
        processType: PROCESS,
        status: "paused",
        currentStep: "pausado",
      })
      .catch(mapConvexError),
  );
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
  const client = await getAuthenticatedConvexClient();
  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: personId as Id<"persons">,
        processType: PROCESS,
        status: "in_progress",
        currentStep: "cursando",
      })
      .catch(mapConvexError),
  );
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
  if (!hasPermission(actor, "ministerial_school.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const n3Done = (
    await client.query(api.formation.listProgressRows, { processTypes: ["destino_n3"], statuses: ["completed"] })
  ).map((r) => ({
    personId: r.progress.personId as string,
    ministryId: r.progress.ministryId as string,
    firstName: r.firstName,
    lastName: r.lastName,
  }));
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
  if (!hasPermission(actor, "ministerial_school.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
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
  if (!hasPermission(actor, "ministerial_school.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  const program = await getEmProgram();
  const client = await getAuthenticatedConvexClient();
  const cycles = await client.query(api.formation.listCycles, {
    programIds: [program.id as Id<"trainingPrograms">],
  });
  return cycles.map(withId);
}

export async function getEmCycleBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "ministerial_school.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });
  if (!cycle) throw new DomainError(DomainErrorCode.NOT_FOUND, "Ciclo no encontrado.");
  const program = await client.query(api.formation.getProgramByCode, { code: EM_PROGRAM_CODE });
  const modules = (
    await client.query(api.formation.listModules, { programId: cycle.programId, activeOnly: true })
  ).map(withId);
  const enrollments = await client.query(api.formation.listEnrollmentsByCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });

  const scoped = [];
  for (const row of enrollments) {
    try {
      const org = await currentOrg(row.enrollment.personId as string);
      if (org?.ministryId) {
        await assertProcessAccess(actor, row.enrollment.personId as string, org.ministryId);
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

  return {
    cycle: withId(cycle),
    program: program ? withId(program) : null,
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
