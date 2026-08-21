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
  return withId(
    await client
      .mutation(api.formation.createCycle, {
        programId: program._id,
        name: raw.name.trim(),
        startDate: raw.startDate,
        endDate: raw.endDate,
        ministryId: (raw.ministryId || undefined) as Id<"ministries"> | undefined,
      })
      .catch(mapConvexError),
  );
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
