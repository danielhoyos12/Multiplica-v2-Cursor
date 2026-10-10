/**
 * Consolidar stages: Pre-Encuentro → Encuentro → Post-Encuentro.
 * Aggregate consolidar.completed syncs when all three are completed.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { withId } from "@/lib/convex-doc";
import { mapConvexError } from "@/lib/convex-errors";
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
import { deriveConsolidarLadderStatus } from "@/modules/formation/consolidar-status";
import {
  countUniqueActiveEnrollments,
  validateCycleDates,
} from "@/modules/formation/cycle-dates";
import {
  OfficialEligibility,
  ensureOfficialCatalog,
} from "@/modules/formation/official-catalog";
import { ENCUENTRO_CODE, POST_ENCUENTRO_CODE, PRE_ENCUENTRO_CODE } from "@/db/schema";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

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

async function getStageProgress(personId: string, stage: ConsolidarStage) {
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: stage,
  });
  return row ? withId(row) : null;
}

async function getConsolidarAggregate(personId: string) {
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: "consolidar",
  });
  return row ? withId(row) : null;
}

async function appendStageEvent(params: {
  progressId: string;
  personId: string;
  processType: ConsolidarStage | "consolidar";
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
      processType: params.processType,
      eventType: params.eventType,
      fromStatus: (params.fromStatus ?? undefined) as never,
      toStatus: (params.toStatus ?? undefined) as never,
      note: params.note ?? undefined,
      metadata: params.metadata ?? {},
    })
    .catch(mapConvexError);
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
export async function syncConsolidarAggregate(personId: string, actorUserId: string | null) {
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
  const client = await getAuthenticatedConvexClient();
  if (existing?.status === "completed") {
    const { ensureDestinoN1Eligible } = await import("./destination");
    await ensureDestinoN1Eligible(personId, org.ministryId, org.networkId);
    return existing;
  }

  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: personId as Id<"persons">,
        processType: "consolidar",
        status: "completed",
        stage: existing ? undefined : "consolidar",
        currentStep: "completado",
        ministryId: org.ministryId as Id<"ministries">,
        networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
        completedAt: Date.now(),
        completedByUserId: (actorUserId ?? undefined) as Id<"users"> | undefined,
        metadata: {
          ...(existing?.metadata ?? {}),
          derived_from: ["pre_encuentro", "encuentro", "post_encuentro"],
          sync: "phase7-reconciliation",
        },
      })
      .catch(mapConvexError),
  );

  if (actorUserId) {
    await appendStageEvent({
      progressId: row.id,
      personId,
      processType: "consolidar",
      eventType: "completed",
      fromStatus: existing?.status ?? null,
      toStatus: "completed",
      actorUserId,
      metadata: { derived: true },
    });
    await writeAuditLog({
      actorUserId,
      action: "process.consolidar.completed",
      entityType: "person_process_progress",
      entityId: row.id,
      metadata: { personId, derived: true },
    });
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
    enrollmentOpenDate?: string | null;
    enrollmentCloseDate?: string | null;
    classDates?: Array<{ moduleId: string; sessionDate: string }>;
    ministryId?: string | null;
  },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "school.cycles.manage", {
    type: "training",
    ministryId: raw.ministryId ?? undefined,
  });
  await ensureOfficialCatalog();
  const client = await getAuthenticatedConvexClient();
  const program = await client.query(api.formation.getProgramByCode, {
    code: STAGE_CODE[raw.stage],
  });
  if (!program) {
    throw new DomainError(DomainErrorCode.CONFIGURATION_ERROR, "Programa no configurado.");
  }

  const modules = await client.query(api.formation.listModules, {
    programId: program._id,
    activeOnly: true,
  });
  const moduleById = new Map(modules.map((m) => [m._id as string, m]));
  const classDates = (raw.classDates ?? [])
    .filter((r) => r.moduleId && r.sessionDate)
    .map((r) => {
      const mod = moduleById.get(r.moduleId);
      return {
        moduleId: r.moduleId,
        sessionDate: r.sessionDate,
        moduleCode: mod?.code,
        moduleName: mod?.name,
      };
    });

  const dateGaps = validateCycleDates({
    startDate: raw.startDate,
    endDate: raw.endDate,
    enrollmentOpenDate: raw.enrollmentOpenDate,
    enrollmentCloseDate: raw.enrollmentCloseDate,
    classDates,
  });
  if (dateGaps.length) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, dateGaps[0]!);
  }

  return withId(
    await client
      .mutation(api.formation.createCycle, {
        programId: program._id,
        name: raw.name.trim(),
        startDate: raw.startDate,
        endDate: raw.endDate,
        enrollmentOpenDate: raw.enrollmentOpenDate || undefined,
        enrollmentCloseDate: raw.enrollmentCloseDate || undefined,
        ministryId: (raw.ministryId || undefined) as Id<"ministries"> | undefined,
        classDates: classDates.map((r) => ({
          moduleId: r.moduleId as Id<"trainingModules">,
          sessionDate: r.sessionDate,
        })),
      })
      .catch(mapConvexError),
  );
}

/** Active catalog modules for a Consolidar stage (class date fields). */
export async function listConsolidarStageModules(stage: ConsolidarStage) {
  await ensureOfficialCatalog();
  const client = await getAuthenticatedConvexClient();
  const program = await client.query(api.formation.getProgramByCode, {
    code: STAGE_CODE[stage],
  });
  if (!program) return [];
  const modules = await client.query(api.formation.listModules, {
    programId: program._id,
    activeOnly: true,
  });
  return modules.map((m) => ({
    id: m._id as string,
    code: m.code,
    name: m.name,
    orderIndex: m.orderIndex,
  }));
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

  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: raw.cycleId as Id<"trainingCycles">,
  });
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.CYCLE_ALREADY_CLOSED,
      "Solo ciclos activos admiten inscripción.",
    );
  }
  const program = await client.query(api.formation.getProgramByCode, {
    code: STAGE_CODE[raw.stage],
  });
  if (!program || cycle.programId !== program._id) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Ciclo no corresponde a la etapa.");
  }

  const progress = await getStageProgress(raw.personId, raw.stage);
  if (progress?.status === "completed") {
    throw new DomainError(DomainErrorCode.CONSOLIDATION_ALREADY_COMPLETED, "Etapa ya completada.");
  }

  const existing = await client.query(api.formation.getEnrollmentByCycleAndPerson, {
    cycleId: raw.cycleId as Id<"trainingCycles">,
    personId: raw.personId as Id<"persons">,
  });
  if (existing) {
    throw new DomainError(DomainErrorCode.CONFLICT, "Ya inscrito en este ciclo.");
  }

  const enrollment = withId(
    await client
      .mutation(api.formation.enroll, {
        cycleId: raw.cycleId as Id<"trainingCycles">,
        personId: raw.personId as Id<"persons">,
      })
      .catch(mapConvexError),
  );

  const updated = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: raw.stage,
        status: "in_progress",
        stage: progress ? undefined : raw.stage,
        currentStep: "cursando",
        ministryId: org.ministryId as Id<"ministries">,
        networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
        startedAt: progress?.startedAt ?? Date.now(),
        metadata: { ...(progress?.metadata ?? {}), cycleId: cycle._id },
      })
      .catch(mapConvexError),
  );

  await appendStageEvent({
    progressId: updated.id,
    personId: raw.personId,
    processType: raw.stage,
    eventType: "enrolled",
    fromStatus: progress?.status ?? null,
    toStatus: "in_progress",
    actorUserId,
    metadata: { cycleId: cycle._id, enrollmentId: enrollment.id },
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

  const { assertConsolidarStageRequirements } = await import(
    "./attendance-requirements"
  );
  const attendanceEval = await assertConsolidarStageRequirements(
    raw.personId,
    raw.stage,
  );

  const existing = await getStageProgress(raw.personId, raw.stage);
  const client = await getAuthenticatedConvexClient();
  const progress = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: raw.stage,
        status: "completed",
        stage: existing ? undefined : raw.stage,
        currentStep: "completado",
        ministryId: org.ministryId as Id<"ministries">,
        networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
        startedAt: existing?.startedAt ?? Date.now(),
        completedAt: Date.now(),
        completedByUserId: actorUserId as Id<"users">,
        metadata: {
          ...(existing?.metadata ?? {}),
          approval_attendance: {
            presentOrRecovered: attendanceEval.presentOrRecovered,
            requiredModules: attendanceEval.requiredModules,
            enrollmentId: attendanceEval.enrollmentId,
            cycleId: attendanceEval.cycleId,
          },
        },
      })
      .catch(mapConvexError),
  );

  await appendStageEvent({
    progressId: progress.id,
    personId: raw.personId,
    processType: raw.stage,
    eventType: "completed",
    toStatus: "completed",
    actorUserId,
    note: raw.note,
    metadata: {
      attendance: attendanceEval,
      approved_with_requirements: true,
    },
  });
  await writeAuditLog({
    actorUserId,
    action: `process.${raw.stage}.completed`,
    entityType: "person_process_progress",
    entityId: progress.id,
    metadata: {
      personId: raw.personId,
      leadership_activated: false,
      attendance: {
        presentOrRecovered: attendanceEval.presentOrRecovered,
        requiredModules: attendanceEval.requiredModules,
      },
    },
  });

  // Apto para la siguiente etapa ≠ matrícula automática en un ciclo.
  if (raw.stage === "pre_encuentro") {
    await ensureEncuentroEligible(raw.personId, org.ministryId, org.networkId);
  } else if (raw.stage === "encuentro") {
    await ensurePostEncuentroEligible(raw.personId, org.ministryId, org.networkId);
  }

  const consolidar = await syncConsolidarAggregate(raw.personId, actorUserId);
  return { progress, consolidar, leadershipActivated: false };
}

/**
 * Workbench KPIs for UDLV stages.
 * - Aptos / Aprobados: from process progress (aptitud / avance).
 * - En curso / inscritos: ONLY real enrollments in open cycles (not consolidar/apto).
 */
export async function getConsolidarDashboardCounts(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const ministryIds =
    !isSuperadmin(actor) && actor.ministryIds.length
      ? (actor.ministryIds as Id<"ministries">[])
      : undefined;
  const rows = await client.query(api.formation.listProgressRows, {
    processTypes: ["pre_encuentro", "encuentro", "post_encuentro"],
    ministryIds,
  });

  const pick = (type: string, statuses: string[]) =>
    rows.filter((r) => r.progress.processType === type && statuses.includes(r.progress.status)).length;

  const enrolledByStage = await countConsolidarStageEnrollments();

  return {
    preAptos: pick("pre_encuentro", ["eligible"]),
    preInProgress: enrolledByStage.pre_encuentro,
    preCompleted: pick("pre_encuentro", ["completed"]),
    encuentroAptos: pick("encuentro", ["eligible"]),
    encuentroInProgress: enrolledByStage.encuentro,
    encuentroCompleted: pick("encuentro", ["completed"]),
    postAptos: pick("post_encuentro", ["eligible"]),
    postInProgress: enrolledByStage.post_encuentro,
    postCompleted: pick("post_encuentro", ["completed"]),
  };
}

/** Unique persons with vigente enrollment per UDLV stage program. */
export async function countConsolidarStageEnrollments(): Promise<
  Record<ConsolidarStage, number>
> {
  const client = await getAuthenticatedConvexClient();
  const stages: ConsolidarStage[] = ["pre_encuentro", "encuentro", "post_encuentro"];
  const programs = await Promise.all(
    stages.map((stage) =>
      client.query(api.formation.getProgramByCode, { code: STAGE_CODE[stage] }),
    ),
  );
  const programIds = programs
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => p._id);
  const enrollments =
    programIds.length === 0
      ? []
      : await client.query(api.formation.listEnrollmentsForPrograms, { programIds });

  const byProgram = new Map<string, ConsolidarStage>();
  stages.forEach((stage, i) => {
    const program = programs[i];
    if (program) byProgram.set(program._id as string, stage);
  });

  const result: Record<ConsolidarStage, number> = {
    pre_encuentro: 0,
    encuentro: 0,
    post_encuentro: 0,
  };
  for (const stage of stages) {
    const rows = enrollments
      .filter((e) => byProgram.get(e.programId as string) === stage)
      .map((e) => ({
        personId: e.personId as string,
        enrollmentStatus: e.enrollmentStatus,
        cycleStatus: e.cycleStatus,
      }));
    result[stage] = countUniqueActiveEnrollments(rows);
  }
  return result;
}

export async function getPersonConsolidarSummary(personId: string) {
  const pre = await getStageProgress(personId, "pre_encuentro");
  const enc = await getStageProgress(personId, "encuentro");
  const post = await getStageProgress(personId, "post_encuentro");
  const agg = await getConsolidarAggregate(personId);
  const derived = deriveConsolidarLadderStatus({
    aggregateStatus: agg?.status,
    preStatus: pre?.status,
    encuentroStatus: enc?.status,
    postStatus: post?.status,
  });
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
      status: derived.status,
      label: statusLabel(derived.status),
      derivedComplete: derived.derivedComplete,
      /** Raw aggregate row — may be stale; do not use for gates/UI. */
      aggregateStatus: agg?.status ?? "pending",
    },
  };
}

async function openStageEligible(
  personId: string,
  stage: ConsolidarStage,
  ministryId: string,
  networkId: string | null,
  openedBy: string,
  currentStep: string,
) {
  const existing = await getStageProgress(personId, stage);
  if (
    existing &&
    (existing.status === "eligible" ||
      existing.status === "in_progress" ||
      existing.status === "academic_completed" ||
      existing.status === "completed")
  ) {
    return existing;
  }

  const client = await getAuthenticatedConvexClient();
  return withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: personId as Id<"persons">,
        processType: stage,
        status: "eligible",
        stage: existing ? undefined : stage,
        currentStep,
        ministryId: ministryId as Id<"ministries">,
        networkId: (networkId ?? undefined) as Id<"networks"> | undefined,
        metadata: {
          ...(existing?.metadata ?? {}),
          opened_by: openedBy,
        },
      })
      .catch(mapConvexError),
  );
}

/**
 * After "Iniciar Consolidar", open Pre-Encuentro as the next UDLV step.
 * Idempotent: does not downgrade an already advanced stage.
 */
export async function ensurePreEncuentroEligible(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  return openStageEligible(
    personId,
    "pre_encuentro",
    ministryId,
    networkId,
    "start_consolidation",
    "apto_pre",
  );
}

/** After Pre approved — person becomes apto for Encuentro (not auto-enrolled). */
export async function ensureEncuentroEligible(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  await assertStageEligible(personId, "encuentro");
  return openStageEligible(
    personId,
    "encuentro",
    ministryId,
    networkId,
    "pre_encuentro_completed",
    "apto_encuentro",
  );
}

/** After Encuentro approved — person becomes apto for Post (not auto-enrolled). */
export async function ensurePostEncuentroEligible(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  await assertStageEligible(personId, "post_encuentro");
  return openStageEligible(
    personId,
    "post_encuentro",
    ministryId,
    networkId,
    "encuentro_completed",
    "apto_post",
  );
}

/**
 * Bandeja de personas por etapa UDLV.
 * Distingue apto / en curso / pendiente; excluye aprobados (completed).
 */
export async function listConsolidarEligible(
  actorUserId: string,
  stage: ConsolidarStage,
) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const ministryIds =
    !isSuperadmin(actor) && actor.ministryIds.length
      ? (actor.ministryIds as Id<"ministries">[])
      : undefined;

  const rows = await client.query(api.formation.listProgressRows, {
    processTypes: [stage],
    statuses: ["eligible", "pending", "in_progress", "academic_completed"],
    ministryIds,
  });

  const program = await client.query(api.formation.getProgramByCode, {
    code: STAGE_CODE[stage],
  });
  const enrollments = program
    ? await client.query(api.formation.listEnrollmentsForPrograms, {
        programIds: [program._id],
      })
    : [];
  const enrolledPersonIds = new Set(
    enrollments
      .filter(
        (e) =>
          (e.cycleStatus === "planned" || e.cycleStatus === "active") &&
          (e.enrollmentStatus === "enrolled" ||
            e.enrollmentStatus === "in_progress" ||
            e.enrollmentStatus === "academic_completed"),
      )
      .map((e) => e.personId as string),
  );

  const result: Array<{
    personId: string;
    fullName: string;
    status: string;
    statusLabel: string;
    bucket: "apto" | "inscrito" | "en_curso" | "pendiente";
  }> = [];

  for (const row of rows) {
    const p = row.progress;
    try {
      await assertProcessAccess(actor, p.personId as string, p.ministryId as string);
    } catch {
      continue;
    }
    const status = p.status as string;
    const personId = p.personId as string;
    const hasEnrollment = enrolledPersonIds.has(personId);
    // Matrícula vigente → en curso; aptitud sin matrícula → apto; resto → pendiente.
    // Never put aptos into "en curso" just because Consolidar/process is open.
    const bucket = hasEnrollment
      ? "en_curso"
      : status === "eligible"
        ? "apto"
        : status === "in_progress" || status === "academic_completed"
          ? "pendiente" // progreso sin matrícula no es "en curso" operativo
          : "pendiente";
    result.push({
      personId,
      fullName: formatFullName(row.firstName, row.lastName),
      status,
      statusLabel: hasEnrollment ? `${statusLabel(status)} · inscrito` : statusLabel(status),
      bucket,
    });
  }
  return result;
}

/** Missing requirements message for stage approval UI. */
export async function explainConsolidarStageGaps(
  personId: string,
  stage: ConsolidarStage,
): Promise<string[]> {
  const gaps: string[] = [];
  try {
    await assertStageEligible(personId, stage);
  } catch (error) {
    if (error instanceof DomainError) gaps.push(error.message);
  }
  const progress = await getStageProgress(personId, stage);
  if (!progress) {
    gaps.push("La persona aún no tiene progreso abierto en esta etapa.");
  } else if (progress.status === "completed") {
    gaps.push("La etapa ya está aprobada.");
  } else if (progress.status === "eligible" || progress.status === "pending") {
    gaps.push("Debe inscribirse en un ciclo activo e iniciar asistencia antes de aprobar.");
  }
  return gaps;
}

export async function listConsolidarCycles(actorUserId: string, stage?: ConsolidarStage) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  await ensureOfficialCatalog();
  const client = await getAuthenticatedConvexClient();
  if (stage) {
    const program = await client.query(api.formation.getProgramByCode, {
      code: STAGE_CODE[stage],
    });
    if (!program) return [];
    const cycles = await client.query(api.formation.listCycles, { programIds: [program._id] });
    return cycles.map(withId);
  }
  const programs = await client.query(api.formation.listProgramsByCodes, {
    codes: [PRE_ENCUENTRO_CODE, ENCUENTRO_CODE, POST_ENCUENTRO_CODE],
  });
  if (!programs.length) return [];
  const cycles = await client.query(api.formation.listCycles, {
    programIds: programs.map((p) => p._id),
  });
  return cycles.map(withId);
}

export async function getConsolidarCycleBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });
  if (!cycle) throw new DomainError(DomainErrorCode.NOT_FOUND, "Ciclo no encontrado.");

  const candidatePrograms = await client.query(api.formation.listProgramsByCodes, {
    codes: [PRE_ENCUENTRO_CODE, ENCUENTRO_CODE, POST_ENCUENTRO_CODE],
  });
  const programRow = candidatePrograms.find((p) => p._id === cycle.programId) ?? null;

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
    program: programRow ? withId(programRow) : null,
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

export const ConsolidarRules = {
  needsPreForEncuentro: OfficialEligibility.encuentro,
  needsEncuentroForPost: OfficialEligibility.postEncuentro,
  consolidarFromThree: OfficialEligibility.consolidar,
  preClassCount: 4,
  postClassCount: 4,
  encuentroDays: 3,
};
