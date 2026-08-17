/**
 * Escuela Ministerial levels EM1 → EM2 → EM3 (official Discípular sequence).
 * Legacy single `escuela_ministerial` program is DEPRECATED.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { withId } from "@/lib/convex-doc";
import { mapConvexError } from "@/lib/convex-errors";
import { EM1_CODE, EM2_CODE, EM3_CODE } from "@/db/schema";
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
import { api, getConvexHttpClient } from "@/server/convex";

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
  const client = getConvexHttpClient();
  const org = await client.query(api.persons.getCurrentOrg, {
    personId: personId as Id<"persons">,
  });
  if (!org) return null;
  return {
    ministryId: (org.ministryId as string | undefined) ?? null,
    networkId: (org.networkId as string | undefined) ?? null,
  };
}

async function getEmProgress(personId: string, level: EmLevel) {
  const client = getConvexHttpClient();
  const row = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: LEVEL_PROCESS[level],
  });
  return row ? withId(row) : null;
}

export async function ensureEmLevelEligible(
  personId: string,
  level: EmLevel,
  ministryId: string,
  networkId: string | null,
) {
  const existing = await getEmProgress(personId, level);
  if (existing && existing.status !== "pending") return existing;
  const client = getConvexHttpClient();
  return withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: personId as Id<"persons">,
        processType: LEVEL_PROCESS[level],
        status: "eligible",
        stage: existing ? undefined : `em${level}`,
        currentStep: `apto_em${level}`,
        ministryId: ministryId as Id<"ministries">,
        networkId: (networkId ?? undefined) as Id<"networks"> | undefined,
        metadata: existing?.metadata ?? {},
      })
      .catch(mapConvexError),
  );
}

export async function assertEmLevelEligible(personId: string, level: EmLevel) {
  const client = getConvexHttpClient();
  if (level === 1) {
    const cd3 = await client.query(api.formation.getProgress, {
      personId: personId as Id<"persons">,
      processType: "destino_n3",
    });
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
  const client = getConvexHttpClient();
  const program = await client.query(api.formation.getProgramByCode, { code: LEVEL_CODE[level] });
  if (!program) {
    throw new DomainError(DomainErrorCode.CONFIGURATION_ERROR, "Programa EM no configurado.");
  }
  return withId(program);
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
  const client = getConvexHttpClient();
  return withId(
    await client
      .mutation(api.formation.createCycle, {
        programId: program.id as Id<"trainingPrograms">,
        name: raw.name.trim(),
        startDate: raw.startDate,
        endDate: raw.endDate,
        ministryId: (raw.ministryId || undefined) as Id<"ministries"> | undefined,
        createdByUserId: actorUserId as Id<"users">,
      })
      .catch(mapConvexError),
  );
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
  const client = getConvexHttpClient();
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
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Ciclo no corresponde al nivel EM.");
  }

  const progress = await getEmProgress(raw.personId, raw.level);
  if (progress?.status === "completed") {
    throw new DomainError(
      DomainErrorCode.MINISTERIAL_SCHOOL_ALREADY_COMPLETED,
      "Nivel EM ya completado.",
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
      })
      .catch(mapConvexError),
  );

  const updated = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: LEVEL_PROCESS[raw.level],
        status: "in_progress",
        stage: progress ? undefined : `em${raw.level}`,
        currentStep: "cursando",
        ministryId: org.ministryId as Id<"ministries">,
        networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
        startedAt: progress?.startedAt ?? Date.now(),
        metadata: { ...(progress?.metadata ?? {}), cycleId: cycle._id },
      })
      .catch(mapConvexError),
  );

  await client
    .mutation(api.formation.appendProcessEvent, {
      progressId: updated.id as Id<"personProcessProgress">,
      personId: raw.personId as Id<"persons">,
      processType: LEVEL_PROCESS[raw.level],
      eventType: "enrolled",
      fromStatus: (progress?.status ?? undefined) as never,
      toStatus: "in_progress",
      actorUserId: actorUserId as Id<"users">,
      metadata: { cycleId: cycle._id, enrollmentId: enrollment.id },
    })
    .catch(mapConvexError);
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
  const client = getConvexHttpClient();
  if (raw.enrollmentId) {
    await client
      .mutation(api.formation.updateEnrollmentStatus, {
        enrollmentId: raw.enrollmentId as Id<"trainingEnrollments">,
        status: "academic_completed",
      })
      .catch(mapConvexError);
  }
  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: LEVEL_PROCESS[raw.level],
        status: "academic_completed",
        currentStep: "academic_completed",
      })
      .catch(mapConvexError),
  );
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

  const client = getConvexHttpClient();
  const program = await getProgram(raw.level);
  const requirements = (
    await client.query(api.formation.listRequirements, { programId: program.id as Id<"trainingPrograms"> })
  ).filter((r) => r.isActive && r.isRequired);
  const overrides = await client.query(api.formation.listOverrides, {
    personId: raw.personId as Id<"persons">,
    programId: program.id as Id<"trainingPrograms">,
  });
  const overridden = new Set(overrides.map((o) => o.requirementId).filter(Boolean));
  for (const req of requirements) {
    if (overridden.has(req._id)) continue;
    if (req.requirementType === "manual_approval" || req.category === "academic") {
      // academic already verified via status
      continue;
    }
  }

  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: LEVEL_PROCESS[raw.level],
        status: "completed",
        currentStep: "completado",
        completedAt: Date.now(),
        completedByUserId: actorUserId as Id<"users">,
        metadata: {
          ...(progress.metadata ?? {}),
          formally_completed: true,
          leadership_activated: false,
        },
      })
      .catch(mapConvexError),
  );

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
    await ensureEmLevelEligible(raw.personId, (raw.level + 1) as EmLevel, org.ministryId, org.networkId);
    await writeAuditLog({
      actorUserId,
      action: "ministerial_school.next_stage_eligible",
      entityType: "person_process_progress",
      entityId: row.id,
      metadata: { personId: raw.personId, nextLevel: nextEligible },
    });
  } else {
    const { ensureSendEligible } = await import("@/modules/send/service");
    await ensureSendEligible(raw.personId, org.ministryId, org.networkId);
    await writeAuditLog({
      actorUserId,
      action: "ministerial_school.next_stage_eligible",
      entityType: "person_process_progress",
      entityId: row.id,
      metadata: {
        personId: raw.personId,
        nextStage: "enviar",
        NEXT_STAGE_ELIGIBLE: true,
        implemented: true,
      },
    });
    await client.mutation(api.formation.upsertProgress, {
      personId: raw.personId as Id<"persons">,
      processType: LEVEL_PROCESS[raw.level],
      status: "completed",
      metadata: {
        ...(row.metadata ?? {}),
        eligible_for_send: true,
        NEXT_STAGE_ELIGIBLE: true,
      },
    });
  }

  return { progress: row, nextEligible, leadershipActivated: false };
}

export async function getEmLevelsDashboardCounts(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "ministerial_school.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  const client = getConvexHttpClient();
  const ministryIds =
    !isSuperadmin(actor) && actor.ministryIds.length
      ? (actor.ministryIds as Id<"ministries">[])
      : undefined;
  const rows = await client.query(api.formation.listProgressRows, {
    processTypes: ["em1", "em2", "em3"],
    ministryIds,
  });
  const pick = (type: string, statuses: string[]) =>
    rows.filter((r) => r.progress.processType === type && statuses.includes(r.progress.status)).length;
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
  if (!hasPermission(actor, "ministerial_school.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  await ensureOfficialCatalog();
  const client = getConvexHttpClient();
  if (level) {
    const program = await getProgram(level);
    const cycles = await client.query(api.formation.listCycles, {
      programIds: [program.id as Id<"trainingPrograms">],
    });
    return cycles.map(withId);
  }
  const programs = await client.query(api.formation.listProgramsByCodes, {
    codes: [EM1_CODE, EM2_CODE, EM3_CODE],
  });
  if (!programs.length) return [];
  const cycles = await client.query(api.formation.listCycles, {
    programIds: programs.map((p) => p._id),
  });
  return cycles.map(withId);
}

export async function getEmLevelCycleBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "ministerial_school.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.MINISTERIAL_SCHOOL_ACCESS_DENIED, "Sin permiso.");
  }
  const client = getConvexHttpClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });
  if (!cycle) throw new DomainError(DomainErrorCode.NOT_FOUND, "Ciclo no encontrado.");
  const candidatePrograms = await client.query(api.formation.listProgramsByCodes, {
    codes: [EM1_CODE, EM2_CODE, EM3_CODE],
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
    doctrina: modules.filter((m) => m.componentCode === "doctrina"),
    seminario: modules.filter((m) => m.componentCode === "seminario"),
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
