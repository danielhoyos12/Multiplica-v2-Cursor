/**
 * Capacitación Destino — Niveles 1–3.
 * Reuses training_* + person_process_*. Never creates person silos.
 * 12 active cell members ≠ 12 G12 leaders.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { withId } from "@/lib/convex-doc";
import { mapConvexError } from "@/lib/convex-errors";
import {
  DESTINO_FAMILY,
  DESTINO_N1_CODE,
  DESTINO_N2_CODE,
  DESTINO_N3_CODE,
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
import { api, getConvexHttpClient } from "@/server/convex";

export type DestinoLevel = 1 | 2 | 3;

const LEVEL_CODE: Record<DestinoLevel, string> = {
  1: DESTINO_N1_CODE,
  2: DESTINO_N2_CODE,
  3: DESTINO_N3_CODE,
};

const LEVEL_PROCESS: Record<DestinoLevel, "destino_n1" | "destino_n2" | "destino_n3"> = {
  1: "destino_n1",
  2: "destino_n2",
  3: "destino_n3",
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

async function getLevelProgress(personId: string, level: DestinoLevel) {
  const client = getConvexHttpClient();
  const row = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: LEVEL_PROCESS[level],
  });
  return row ? withId(row) : null;
}

async function appendEvent(params: {
  progressId: string;
  personId: string;
  processType: "destino_n1" | "destino_n2" | "destino_n3";
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const client = getConvexHttpClient();
  await client
    .mutation(api.formation.appendProcessEvent, {
      progressId: params.progressId as Id<"personProcessProgress">,
      personId: params.personId as Id<"persons">,
      processType: params.processType,
      eventType: params.eventType,
      fromStatus: (params.fromStatus ?? undefined) as never,
      toStatus: (params.toStatus ?? undefined) as never,
      actorUserId: params.actorUserId as Id<"users">,
      note: params.note ?? undefined,
      metadata: params.metadata ?? {},
    })
    .catch(mapConvexError);
}

export async function ensureDestinoPrograms() {
  const client = getConvexHttpClient();
  const defs = [
    {
      code: DESTINO_N1_CODE,
      name: "Destino Nivel 1",
      level: 1,
      description: "Capacitación Destino — Nivel 1",
    },
    {
      code: DESTINO_N2_CODE,
      name: "Destino Nivel 2",
      level: 2,
      description: "Capacitación Destino — Nivel 2",
    },
    {
      code: DESTINO_N3_CODE,
      name: "Destino Nivel 3",
      level: 3,
      description: "Capacitación Destino — Nivel 3",
    },
  ] as const;

  const programs = [];
  for (const def of defs) {
    const program = withId(
      await client.mutation(api.formation.ensureProgram, {
        code: def.code,
        name: def.name,
        description: def.description,
        level: def.level,
        family: DESTINO_FAMILY,
      }),
    );

    const modules = await client.query(api.formation.listModules, {
      programId: program.id as Id<"trainingPrograms">,
    });
    if (modules.length === 0) {
      await client.mutation(api.formation.syncModules, {
        programId: program.id as Id<"trainingPrograms">,
        modules: [1, 2, 3, 4].map((n) => ({ code: `M${n}`, name: `Módulo ${n}`, orderIndex: n })),
      });
    }

    const reqs = await client.query(api.formation.listRequirements, {
      programId: program.id as Id<"trainingPrograms">,
    });
    if (reqs.length === 0) {
      await client.mutation(api.formation.syncRequirements, {
        programId: program.id as Id<"trainingPrograms">,
        requirements: [
          {
            requirementType: "manual_approval",
            category: "academic",
            label: "Componente académico aprobado",
          },
          {
            requirementType: "active_cell_members",
            numericValue: 12,
            category: "pastoral",
            label: "12 personas activas en célula evangelística",
          },
        ],
      });
    }
    programs.push(program);
  }
  return programs;
}

export async function ensureDestinoN1Eligible(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  const existing = await getLevelProgress(personId, 1);
  if (existing && existing.status !== "pending") return existing;
  const client = getConvexHttpClient();
  return withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: personId as Id<"persons">,
        processType: "destino_n1",
        status: "eligible",
        stage: existing ? undefined : "n1",
        currentStep: "apto_n1",
        ministryId: ministryId as Id<"ministries">,
        networkId: (networkId ?? undefined) as Id<"networks"> | undefined,
        metadata: { ...(existing?.metadata ?? {}), eligible_for_destino_n1: true },
      })
      .catch(mapConvexError),
  );
}

export async function assertDestinoEligible(personId: string, level: DestinoLevel) {
  if (level === 1) {
    // Official: Consolidar completed (Pre+Encuentro+Post). UDV is NOT a gate.
    const client = getConvexHttpClient();
    const consolidar = await client.query(api.formation.getProgress, {
      personId: personId as Id<"persons">,
      processType: "consolidar",
    });
    if (!consolidar || consolidar.status !== "completed") {
      throw new DomainError(
        DomainErrorCode.DESTINATION_LEVEL_1_NOT_ELIGIBLE,
        "Consolidar (Pre + Encuentro + Post) debe estar completado.",
      );
    }
    return;
  }
  if (level === 2) {
    const prev = await getLevelProgress(personId, 1);
    if (!prev || prev.status !== "completed") {
      throw new DomainError(
        DomainErrorCode.DESTINATION_LEVEL_2_NOT_ELIGIBLE,
        "Capacitación Destino 1 debe estar formalmente completada.",
      );
    }
    return;
  }
  // Level 3: CD2 + Re-Encuentro (NOT after Escuela Ministerial)
  const prev = await getLevelProgress(personId, 2);
  if (!prev || prev.status !== "completed") {
    throw new DomainError(
      DomainErrorCode.DESTINATION_LEVEL_3_NOT_ELIGIBLE,
      "Capacitación Destino 2 debe estar formalmente completada.",
    );
  }
  const client = getConvexHttpClient();
  const re = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: "reencuentro",
  });
  if (!re || re.status !== "completed") {
    throw new DomainError(
      DomainErrorCode.DESTINATION_LEVEL_3_NOT_ELIGIBLE,
      "Re-Encuentro debe estar completado antes de Capacitación Destino 3.",
    );
  }
}

export async function isDestinoLevelEligible(personId: string, level: DestinoLevel) {
  try {
    await assertDestinoEligible(personId, level);
    const current = await getLevelProgress(personId, level);
    if (current?.status === "completed") return false;
    return true;
  } catch {
    return false;
  }
}

async function getProgramByLevel(level: DestinoLevel) {
  await ensureDestinoPrograms();
  const client = getConvexHttpClient();
  const program = await client.query(api.formation.getProgramByCode, { code: LEVEL_CODE[level] });
  if (!program) {
    throw new DomainError(DomainErrorCode.CONFIGURATION_ERROR, "Programa Destino no configurado.");
  }
  return withId(program);
}

async function assertCycleStaffOrManage(
  actor: AuthContext,
  cycleId: string,
  capability: "attendance" | "recovery" | "academic" | "complete",
) {
  if (isSuperadmin(actor)) return;
  if (hasPermission(actor, "destination.manage") || hasPermission(actor, "school.cycles.manage")) {
    return;
  }
  const client = getConvexHttpClient();
  const staff = await client.query(api.formation.getCycleStaff, {
    cycleId: cycleId as Id<"trainingCycles">,
    userId: actor.userId as Id<"users">,
  });
  if (!staff) {
    throw new DomainError(
      DomainErrorCode.DESTINATION_ACCESS_DENIED,
      "No eres staff asignado a este ciclo.",
    );
  }
  if (capability === "attendance" && !staff.canTakeAttendance) {
    throw new DomainError(DomainErrorCode.DESTINATION_ACCESS_DENIED, "Sin permiso de asistencia.");
  }
  if (capability === "recovery" && !staff.canAuthorizeRecovery) {
    throw new DomainError(DomainErrorCode.DESTINATION_ACCESS_DENIED, "Sin permiso de recuperación.");
  }
  if (capability === "academic" && !staff.canCompleteAcademic) {
    throw new DomainError(DomainErrorCode.DESTINATION_ACCESS_DENIED, "Sin permiso académico.");
  }
  if (capability === "complete" && !staff.canCompleteLevel) {
    throw new DomainError(
      DomainErrorCode.DESTINATION_ACCESS_DENIED,
      "Sin permiso para completar nivel.",
    );
  }
}

/**
 * Count ACTIVE memberships on the participant's active evangelistic cell.
 * Prefer evangelistic; if none, fall back to any non-closed own cell.
 * Does NOT count leaders of the 12 — this is PERSONS, not G12 leaders.
 */
export async function countActiveCellMembersForPerson(personId: string) {
  const client = getConvexHttpClient();
  return client.query(api.formation.countActiveCellMembers, {
    personId: personId as Id<"persons">,
  });
}

export async function evaluateLevelRequirements(personId: string, level: DestinoLevel) {
  const program = await getProgramByLevel(level);
  const client = getConvexHttpClient();
  const requirements = (
    await client.query(api.formation.listRequirements, { programId: program.id as Id<"trainingPrograms"> })
  ).filter((r) => r.isActive && r.isRequired);

  const overrides = await client.query(api.formation.listOverrides, {
    personId: personId as Id<"persons">,
    programId: program.id as Id<"trainingPrograms">,
  });
  const overriddenIds = new Set(overrides.map((o) => o.requirementId).filter(Boolean));

  const progress = await getLevelProgress(personId, level);
  const academicDone =
    progress?.status === "academic_completed" || progress?.status === "completed";

  const results = [];
  for (const req of requirements) {
    if (overriddenIds.has(req._id)) {
      results.push({
        requirementId: req._id as string,
        type: req.requirementType,
        category: req.category,
        label: req.label ?? req.requirementType,
        required: req.numericValue ?? null,
        actual: null as number | null,
        passed: true,
        overridden: true,
      });
      continue;
    }

    if (req.requirementType === "manual_approval" || req.requirementType === "modules_completed") {
      results.push({
        requirementId: req._id as string,
        type: req.requirementType,
        category: req.category,
        label: req.label ?? "Componente académico",
        required: 1,
        actual: academicDone ? 1 : 0,
        passed: academicDone,
        overridden: false,
      });
      continue;
    }

    if (req.requirementType === "active_cell_members") {
      const needed = req.numericValue ?? 12;
      const members = await countActiveCellMembersForPerson(personId);
      results.push({
        requirementId: req._id as string,
        type: req.requirementType,
        category: req.category,
        label: req.label ?? `${needed} personas activas en célula`,
        required: needed,
        actual: members.count,
        passed: members.count >= needed,
        overridden: false,
        cellId: members.cellId as string | null,
        cellType: members.cellType,
        note: "Cuenta memberships activas (personas), NO líderes G12.",
      });
      continue;
    }

    results.push({
      requirementId: req._id as string,
      type: req.requirementType,
      category: req.category,
      label: req.label ?? req.requirementType,
      required: req.numericValue ?? null,
      actual: null,
      passed: false,
      overridden: false,
    });
  }

  const academic = results.filter((r) => r.category === "academic");
  const pastoral = results.filter((r) => r.category === "pastoral");
  return {
    level,
    programId: program.id as string,
    academicPassed: academic.every((r) => r.passed),
    pastoralPassed: pastoral.every((r) => r.passed),
    allPassed: results.every((r) => r.passed),
    results,
  };
}

export async function createDestinoCycle(
  actorUserId: string,
  raw: {
    level: DestinoLevel;
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
  if (raw.level < 1 || raw.level > 3) {
    throw new DomainError(DomainErrorCode.DESTINATION_INVALID_LEVEL, "Nivel inválido.");
  }
  const program = await getProgramByLevel(raw.level);
  const client = getConvexHttpClient();
  const cycle = withId(
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
  await writeAuditLog({
    actorUserId,
    action: "school.cycle.created",
    entityType: "training_cycle",
    entityId: cycle.id,
    metadata: { level: raw.level, program: program.code },
  });
  return cycle;
}

export async function assignCycleStaff(
  actorUserId: string,
  raw: {
    cycleId: string;
    userId: string;
    role?: "teacher" | "coordinator" | "assistant";
    canCompleteLevel?: boolean;
  },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "training.cycles.assign_staff", { type: "training" });
  const client = getConvexHttpClient();
  return withId(
    await client
      .mutation(api.formation.assignCycleStaff, {
        cycleId: raw.cycleId as Id<"trainingCycles">,
        userId: raw.userId as Id<"users">,
        role: raw.role,
        canCompleteLevel: raw.canCompleteLevel,
      })
      .catch(mapConvexError),
  );
}

export async function enrollDestino(
  actorUserId: string,
  raw: { personId: string; cycleId: string; level: DestinoLevel },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "destination.manage", {
    type: "training",
    personId: raw.personId,
  });

  await assertDestinoEligible(raw.personId, raw.level);
  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia organizacional.");
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);

  const program = await getProgramByLevel(raw.level);
  const client = getConvexHttpClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: raw.cycleId as Id<"trainingCycles">,
  });
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.DESTINATION_CYCLE_NOT_ACTIVE,
      "Solo ciclos activos admiten inscripción.",
    );
  }
  if (cycle.programId !== (program.id as Id<"trainingPrograms">)) {
    throw new DomainError(
      DomainErrorCode.DESTINATION_INVALID_LEVEL,
      "El ciclo no corresponde al nivel indicado.",
    );
  }

  const progress = await getLevelProgress(raw.personId, raw.level);
  if (progress?.status === "completed") {
    throw new DomainError(
      DomainErrorCode.DESTINATION_ALREADY_COMPLETED,
      "Nivel ya completado formalmente.",
    );
  }

  const existing = await client.query(api.formation.getEnrollmentByCycleAndPerson, {
    cycleId: raw.cycleId as Id<"trainingCycles">,
    personId: raw.personId as Id<"persons">,
  });
  if (existing) {
    throw new DomainError(DomainErrorCode.DESTINATION_ALREADY_ENROLLED, "Ya inscrito en este ciclo.");
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
        processType: LEVEL_PROCESS[raw.level],
        status: "in_progress",
        stage: progress ? undefined : `n${raw.level}`,
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
    processType: LEVEL_PROCESS[raw.level],
    eventType: "enrolled",
    fromStatus: progress?.status ?? null,
    toStatus: "in_progress",
    actorUserId,
    metadata: { cycleId: cycle._id, enrollmentId: enrollment.id, level: raw.level },
  });
  await writeAuditLog({
    actorUserId,
    action: "destination.enrolled",
    entityType: "training_enrollment",
    entityId: enrollment.id,
    metadata: { personId: raw.personId, level: raw.level, cycleId: cycle._id },
  });

  return { enrollment, progress: updatedProgress };
}

export async function markAcademicCompleted(
  actorUserId: string,
  raw: { personId: string; level: DestinoLevel; enrollmentId?: string; note?: string },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "destination.complete_academic", {
    type: "training",
    personId: raw.personId,
  });

  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia.");
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);

  const progress = await getLevelProgress(raw.personId, raw.level);
  if (!progress || !["in_progress", "paused", "academic_completed"].includes(progress.status)) {
    throw new DomainError(
      DomainErrorCode.DESTINATION_PREREQUISITE_NOT_MET,
      "Debe estar cursando el nivel.",
    );
  }
  if (progress.status === "completed") {
    throw new DomainError(DomainErrorCode.DESTINATION_ALREADY_COMPLETED, "Nivel ya completado.");
  }

  const client = getConvexHttpClient();
  if (raw.enrollmentId) {
    const enrollment = await client.query(api.formation.getEnrollment, {
      enrollmentId: raw.enrollmentId as Id<"trainingEnrollments">,
    });
    if (enrollment) {
      await assertCycleStaffOrManage(actor, enrollment.cycleId, "academic");
      await client.mutation(api.formation.updateEnrollmentStatus, {
        enrollmentId: enrollment._id,
        status: "academic_completed",
      });
    }
  }

  const row = withId(
    await client
      .mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: LEVEL_PROCESS[raw.level],
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
    processType: LEVEL_PROCESS[raw.level],
    eventType: "academic_completed",
    fromStatus: progress.status,
    toStatus: "academic_completed",
    actorUserId,
    note: raw.note,
  });
  await writeAuditLog({
    actorUserId,
    action: "destination.academic_completed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId: raw.personId, level: raw.level },
  });
  return row;
}

export async function completeDestinoLevel(
  actorUserId: string,
  raw: {
    personId: string;
    level: DestinoLevel;
    note?: string;
    overrideRequirementIds?: string[];
    overrideReason?: string;
  },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "destination.complete_level", {
    type: "training",
    personId: raw.personId,
  });

  const org = await currentOrg(raw.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia.");
  }
  await assertProcessAccess(actor, raw.personId, org.ministryId);

  const progress = await getLevelProgress(raw.personId, raw.level);
  if (!progress) {
    throw new DomainError(DomainErrorCode.PROCESS_NOT_FOUND, "Progreso de nivel no encontrado.");
  }
  if (progress.status === "completed") {
    return { progress, nextEligible: raw.level < 3 ? raw.level + 1 : null, leadershipActivated: false };
  }
  if (progress.status !== "academic_completed") {
    throw new DomainError(
      DomainErrorCode.DESTINATION_ACADEMIC_NOT_COMPLETED,
      "Marque primero el componente académico.",
    );
  }

  const client = getConvexHttpClient();

  // Apply overrides if requested
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
        "Override requiere razón explícita.",
      );
    }
    const program = await getProgramByLevel(raw.level);
    for (const requirementId of raw.overrideRequirementIds) {
      await client
        .mutation(api.formation.insertOverride, {
          personId: raw.personId as Id<"persons">,
          programId: program.id as Id<"trainingPrograms">,
          requirementId: requirementId as Id<"trainingCompletionRequirements">,
          reason: raw.overrideReason.trim(),
          actorUserId: actorUserId as Id<"users">,
        })
        .catch(mapConvexError);
      await writeAuditLog({
        actorUserId,
        action: "destination.requirement_overridden",
        entityType: "training_requirement_override",
        entityId: requirementId,
        metadata: {
          personId: raw.personId,
          level: raw.level,
          reason: raw.overrideReason.trim(),
        },
        reason: raw.overrideReason.trim(),
      });
    }
  }

  const evaluation = await evaluateLevelRequirements(raw.personId, raw.level);
  if (!evaluation.academicPassed) {
    throw new DomainError(
      DomainErrorCode.DESTINATION_ACADEMIC_NOT_COMPLETED,
      "Componente académico incompleto.",
      { evaluation },
    );
  }
  if (!evaluation.pastoralPassed) {
    await writeAuditLog({
      actorUserId,
      action: "destination.requirement_failed",
      entityType: "person_process_progress",
      entityId: progress.id,
      metadata: {
        personId: raw.personId,
        level: raw.level,
        results: evaluation.results.map((r) => ({
          type: r.type,
          passed: r.passed,
          actual: r.actual,
          required: r.required,
        })),
      },
    });
    throw new DomainError(
      DomainErrorCode.DESTINATION_PASTORAL_REQUIREMENT_NOT_MET,
      "Pendiente de requisito pastoral.",
      { evaluation },
    );
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

  const program = await getProgramByLevel(raw.level);
  const programCycles = await client.query(api.formation.listCycles, {
    programIds: [program.id as Id<"trainingPrograms">],
  });
  for (const cycle of programCycles) {
    const enrollment = await client.query(api.formation.getEnrollmentByCycleAndPerson, {
      cycleId: cycle._id,
      personId: raw.personId as Id<"persons">,
    });
    if (enrollment && ["enrolled", "in_progress", "academic_completed"].includes(enrollment.status)) {
      await client.mutation(api.formation.updateEnrollmentStatus, {
        enrollmentId: enrollment._id,
        status: "completed",
        completedByUserId: actorUserId as Id<"users">,
      });
    }
  }

  await appendEvent({
    progressId: row.id,
    personId: raw.personId,
    processType: LEVEL_PROCESS[raw.level],
    eventType: "level_completed",
    fromStatus: progress.status,
    toStatus: "completed",
    actorUserId,
    note: raw.note,
    metadata: { level: raw.level },
  });
  await writeAuditLog({
    actorUserId,
    action: "destination.level_completed",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: {
      personId: raw.personId,
      level: raw.level,
      leadership_activated: false,
      cell_created: false,
    },
  });

  // When CD1 completes → next is CD2 eligible (not reencuentro)
  // When CD2 completes → Re-Encuentro eligible (NOT CD3)
  let nextEligible: number | null = null;
  if (raw.level === 1) {
    nextEligible = 2;
    const nextProgress = await getLevelProgress(raw.personId, 2);
    if (!nextProgress) {
      await client.mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: "destino_n2",
        status: "eligible",
        stage: "n2",
        currentStep: "apto_n2",
        ministryId: org.ministryId as Id<"ministries">,
        networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
        metadata: { eligible_from_level: 1 },
      });
    } else if (nextProgress.status === "pending") {
      await client.mutation(api.formation.upsertProgress, {
        personId: raw.personId as Id<"persons">,
        processType: "destino_n2",
        status: "eligible",
        currentStep: "apto_n2",
      });
    }
    await writeAuditLog({
      actorUserId,
      action: "destination.next_level_eligible",
      entityType: "person_process_progress",
      entityId: row.id,
      metadata: { personId: raw.personId, nextLevel: 2 },
    });
  } else if (raw.level === 2) {
    // CD2 → Re-Encuentro eligible
    const { ensureReencuentroEligible } = await import("./reencounter");
    await ensureReencuentroEligible(raw.personId, org.ministryId, org.networkId);
    await writeAuditLog({
      actorUserId,
      action: "destination.next_level_eligible",
      entityType: "person_process_progress",
      entityId: row.id,
      metadata: { personId: raw.personId, nextStage: "reencuentro" },
    });
  } else {
    // Nivel 3 / CD3 complete → Escuela Ministerial 1 eligible (NOT Re-Encuentro)
    const { ensureEmLevelEligible } = await import("./em-levels");
    await ensureEmLevelEligible(raw.personId, 1, org.ministryId, org.networkId);
    await writeAuditLog({
      actorUserId,
      action: "destination.next_level_eligible",
      entityType: "person_process_progress",
      entityId: row.id,
      metadata: {
        personId: raw.personId,
        nextStage: "em1",
        implemented: true,
      },
    });
  }

  return { progress: row, nextEligible, leadershipActivated: false };
}

export async function listDestinoEligible(actorUserId: string, level: DestinoLevel) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "destination.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.DESTINATION_ACCESS_DENIED, "Sin permiso.");
  }
  const client = getConvexHttpClient();

  if (level === 1) {
    // Consolidar completed and N1 not completed (UDV is NOT a gate)
    const consolidarDone = await client.query(api.formation.listProgressRows, {
      processTypes: ["consolidar"],
      statuses: ["completed"],
    });
    const result = [];
    for (const row of consolidarDone) {
      const p = row.progress;
      if (!isSuperadmin(actor) && !canAccessMinistry(actor, p.ministryId)) continue;
      try {
        await assertProcessAccess(actor, p.personId, p.ministryId);
      } catch {
        continue;
      }
      const n1 = await getLevelProgress(p.personId, 1);
      if (n1?.status === "completed") continue;
      result.push({
        personId: p.personId as string,
        fullName: formatFullName(row.firstName, row.lastName),
        levelStatus: n1?.status ?? "eligible",
      });
    }
    return result;
  }

  if (level === 3) {
    // CD2 + Re-Encuentro completed
    const cd2Done = await client.query(api.formation.listProgressRows, {
      processTypes: ["destino_n2"],
      statuses: ["completed"],
    });
    const result = [];
    for (const row of cd2Done) {
      const p = row.progress;
      if (!isSuperadmin(actor) && !canAccessMinistry(actor, p.ministryId)) continue;
      try {
        await assertProcessAccess(actor, p.personId, p.ministryId);
      } catch {
        continue;
      }
      const re = await client.query(api.formation.getProgress, {
        personId: p.personId,
        processType: "reencuentro",
      });
      if (!re || re.status !== "completed") continue;
      const cur = await getLevelProgress(p.personId, 3);
      if (cur?.status === "completed") continue;
      result.push({
        personId: p.personId as string,
        fullName: formatFullName(row.firstName, row.lastName),
        levelStatus: cur?.status ?? "eligible",
      });
    }
    return result;
  }

  const prevLevel = (level - 1) as DestinoLevel;
  const prevDone = await client.query(api.formation.listProgressRows, {
    processTypes: [LEVEL_PROCESS[prevLevel]],
    statuses: ["completed"],
  });
  const result = [];
  for (const row of prevDone) {
    const p = row.progress;
    if (!isSuperadmin(actor) && !canAccessMinistry(actor, p.ministryId)) continue;
    try {
      await assertProcessAccess(actor, p.personId, p.ministryId);
    } catch {
      continue;
    }
    const cur = await getLevelProgress(p.personId, level);
    if (cur?.status === "completed") continue;
    result.push({
      personId: p.personId as string,
      fullName: formatFullName(row.firstName, row.lastName),
      levelStatus: cur?.status ?? "eligible",
    });
  }
  return result;
}

export async function getDestinoDashboardCounts(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "destination.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.DESTINATION_ACCESS_DENIED, "Sin permiso.");
  }
  const client = getConvexHttpClient();
  const ministryIds =
    !isSuperadmin(actor) && actor.ministryIds.length
      ? (actor.ministryIds as Id<"ministries">[])
      : undefined;
  const rows = await client.query(api.formation.listProgressRows, {
    processTypes: ["destino_n1", "destino_n2", "destino_n3"],
    ministryIds,
  });

  const pick = (type: string, statuses: string[]) =>
    rows.filter((r) => r.progress.processType === type && statuses.includes(r.progress.status)).length;

  const eligibleN1 = await listDestinoEligible(actorUserId, 1);
  const eligibleN2 = await listDestinoEligible(actorUserId, 2);
  const eligibleN3 = await listDestinoEligible(actorUserId, 3);

  return {
    n1InProgress: pick("destino_n1", ["in_progress", "eligible", "pending"]),
    n1Academic: pick("destino_n1", ["academic_completed"]),
    n1Completed: pick("destino_n1", ["completed"]),
    n2InProgress: pick("destino_n2", ["in_progress", "eligible", "pending"]),
    n2Academic: pick("destino_n2", ["academic_completed"]),
    n2Completed: pick("destino_n2", ["completed"]),
    n3InProgress: pick("destino_n3", ["in_progress", "eligible", "pending"]),
    n3Academic: pick("destino_n3", ["academic_completed"]),
    n3Completed: pick("destino_n3", ["completed"]),
    aptosN1: eligibleN1.length,
    aptosN2: eligibleN2.length,
    aptosN3: eligibleN3.length,
    pendingPastoral:
      pick("destino_n1", ["academic_completed"]) +
      pick("destino_n2", ["academic_completed"]) +
      pick("destino_n3", ["academic_completed"]),
  };
}

export async function listDestinoCycles(actorUserId: string, level?: DestinoLevel) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "destination.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.DESTINATION_ACCESS_DENIED, "Sin permiso.");
  }
  await ensureDestinoPrograms();
  const client = getConvexHttpClient();
  if (level) {
    const program = await getProgramByLevel(level);
    const cycles = await client.query(api.formation.listCycles, {
      programIds: [program.id as Id<"trainingPrograms">],
    });
    return cycles.map(withId);
  }
  const programs = await client.query(api.formation.listProgramsByFamily, {
    family: DESTINO_FAMILY,
  });
  if (!programs.length) return [];
  const cycles = await client.query(api.formation.listCycles, {
    programIds: programs.map((p) => p._id),
  });
  return cycles.map(withId);
}

export async function getDestinoCycleBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "destination.read") && !hasPermission(actor, "udv.read")) {
    throw new DomainError(DomainErrorCode.DESTINATION_ACCESS_DENIED, "Sin permiso.");
  }
  const client = getConvexHttpClient();
  const cycle = await client.query(api.formation.getCycle, {
    cycleId: cycleId as Id<"trainingCycles">,
  });
  if (!cycle) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ciclo no encontrado.");
  }
  const candidatePrograms = await client.query(api.formation.listProgramsByFamily, {
    family: DESTINO_FAMILY,
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

  const participants = [];
  for (const s of scoped) {
    const level = (programRow?.level ?? 1) as DestinoLevel;
    const evalReq = await evaluateLevelRequirements(s.enrollment.personId as string, level);
    participants.push({
      enrollmentId: s.enrollment._id as string,
      personId: s.enrollment.personId as string,
      fullName: formatFullName(s.firstName, s.lastName),
      status: s.enrollment.status,
      attendance: Object.fromEntries(
        attendanceRows
          .filter((a) => a.enrollmentId === s.enrollment._id)
          .map((a) => [a.moduleId as string, withId(a)]),
      ),
      pastoralPending: evalReq.academicPassed && !evalReq.pastoralPassed,
      memberCount: evalReq.results.find((r) => r.type === "active_cell_members")?.actual ?? null,
    });
  }

  return { cycle: withId(cycle), program: programRow ? withId(programRow) : null, modules, participants };
}

export async function getPersonDestinoSummary(personId: string) {
  const n1 = await getLevelProgress(personId, 1);
  const n2 = await getLevelProgress(personId, 2);
  const n3 = await getLevelProgress(personId, 3);
  return {
    n1: n1 ? { status: n1.status, label: statusLabel(n1.status) } : { status: "pending", label: "Pendiente" },
    n2: n2 ? { status: n2.status, label: statusLabel(n2.status) } : { status: "pending", label: "Pendiente" },
    n3: n3 ? { status: n3.status, label: statusLabel(n3.status) } : { status: "pending", label: "Pendiente" },
  };
}

export const DestinationRules = {
  /** CD1 requires Consolidar completed — UDV is NOT a gate. */
  canEnterLevel1(consolidarStatus: string | null | undefined) {
    return consolidarStatus === "completed";
  },
  canEnterLevel(prevCompleted: boolean) {
    return prevCompleted;
  },
  /** CD3 requires CD2 completed AND Re-Encuentro completed. */
  canEnterLevel3(cd2Completed: boolean, reencuentroCompleted: boolean) {
    return cd2Completed && reencuentroCompleted;
  },
  eligibilityDoesNotEnroll: true as const,
  completingDoesNotActivateLeader: true as const,
  completingDoesNotCreateCell: true as const,
  personsNotLeaders(count: number, required: number) {
    return count >= required;
  },
  twelvePersonsIsNotTwelveLeaders: true as const,
  udvIsNotGateBeforeCd1: true as const,
};
