/**
 * Capacitación Destino — Niveles 1–3.
 * Reuses training_* + person_process_*. Never creates person silos.
 * 12 active cell members ≠ 12 G12 leaders.
 */
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  cellMemberships,
  cells,
  DESTINO_FAMILY,
  DESTINO_N1_CODE,
  DESTINO_N2_CODE,
  DESTINO_N3_CODE,
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

async function getLevelProgress(personId: string, level: DestinoLevel) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, LEVEL_PROCESS[level]),
      ),
    )
    .limit(1);
  return row ?? null;
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
  const db = getDb();
  await db.insert(personProcessEvents).values({
    progressId: params.progressId,
    personId: params.personId,
    processType: params.processType,
    eventType: params.eventType,
    fromStatus: (params.fromStatus as never) ?? null,
    toStatus: (params.toStatus as never) ?? null,
    actorUserId: params.actorUserId,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
  });
}

export async function ensureDestinoPrograms() {
  const db = getDb();
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
    let [program] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.code, def.code))
      .limit(1);
    if (!program) {
      [program] = await db
        .insert(trainingPrograms)
        .values({
          code: def.code,
          name: def.name,
          description: def.description,
          level: def.level,
          family: DESTINO_FAMILY,
          isActive: true,
        })
        .returning();
    } else if (program.family !== DESTINO_FAMILY || program.level !== def.level) {
      [program] = await db
        .update(trainingPrograms)
        .set({
          family: DESTINO_FAMILY,
          level: def.level,
          name: def.name,
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
      await db.insert(trainingModules).values(
        [1, 2, 3, 4].map((n) => ({
          programId: program.id,
          code: `M${n}`,
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
      await db.insert(trainingCompletionRequirements).values([
        {
          programId: program.id,
          requirementType: "manual_approval",
          category: "academic",
          label: "Componente académico aprobado",
          isRequired: true,
          isActive: true,
        },
        {
          programId: program.id,
          requirementType: "active_cell_members",
          numericValue: 12,
          category: "pastoral",
          label: "12 personas activas en célula evangelística",
          isRequired: true,
          isActive: true,
        },
      ]);
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
  if (existing) {
    if (existing.status === "pending") {
      const db = getDb();
      const [row] = await db
        .update(personProcessProgress)
        .set({
          status: "eligible",
          currentStep: "apto_n1",
          updatedAt: new Date(),
          metadata: { ...(existing.metadata ?? {}), eligible_for_destino_n1: true },
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
      processType: "destino_n1",
      status: "eligible",
      stage: "n1",
      currentStep: "apto_n1",
      ministryId,
      networkId,
      metadata: { eligible_for_destino_n1: true },
    })
    .returning();
  return row;
}

export async function assertDestinoEligible(personId: string, level: DestinoLevel) {
  if (level === 1) {
    // Official: Consolidar completed (Pre+Encuentro+Post). UDV is NOT a gate.
    const db = getDb();
    const [consolidar] = await db
      .select()
      .from(personProcessProgress)
      .where(
        and(
          eq(personProcessProgress.personId, personId),
          eq(personProcessProgress.processType, "consolidar"),
        ),
      )
      .limit(1);
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
  const db = getDb();
  const [re] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, "reencuentro"),
      ),
    )
    .limit(1);
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
  const db = getDb();
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.code, LEVEL_CODE[level]))
    .limit(1);
  if (!program) {
    throw new DomainError(DomainErrorCode.CONFIGURATION_ERROR, "Programa Destino no configurado.");
  }
  return program;
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
  const db = getDb();
  const ownCells = await db
    .select()
    .from(cells)
    .where(
      and(eq(cells.responsiblePersonId, personId), sql`${cells.status} <> 'closed'`),
    );
  const evangelistic = ownCells.find((c) => c.type === "evangelistic" && c.status === "active");
  const cell = evangelistic ?? ownCells.find((c) => c.status === "active") ?? null;
  if (!cell) {
    return { cellId: null as string | null, count: 0, cellType: null as string | null };
  }
  const [{ c }] = await db
    .select({ c: count() })
    .from(cellMemberships)
    .where(and(eq(cellMemberships.cellId, cell.id), eq(cellMemberships.status, "active")));
  return { cellId: cell.id, count: Number(c), cellType: cell.type };
}

export async function evaluateLevelRequirements(personId: string, level: DestinoLevel) {
  const program = await getProgramByLevel(level);
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

  const progress = await getLevelProgress(personId, level);
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
        required: req.numericValue,
        actual: null as number | null,
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
        requirementId: req.id,
        type: req.requirementType,
        category: req.category,
        label: req.label ?? `${needed} personas activas en célula`,
        required: needed,
        actual: members.count,
        passed: members.count >= needed,
        overridden: false,
        cellId: members.cellId,
        cellType: members.cellType,
        note: "Cuenta memberships activas (personas), NO líderes G12.",
      });
      continue;
    }

    results.push({
      requirementId: req.id,
      type: req.requirementType,
      category: req.category,
      label: req.label ?? req.requirementType,
      required: req.numericValue,
      actual: null,
      passed: false,
      overridden: false,
    });
  }

  const academic = results.filter((r) => r.category === "academic");
  const pastoral = results.filter((r) => r.category === "pastoral");
  return {
    level,
    programId: program.id,
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
  const db = getDb();
  const [existing] = await db
    .select()
    .from(trainingCycleStaff)
    .where(
      and(
        eq(trainingCycleStaff.cycleId, raw.cycleId),
        eq(trainingCycleStaff.userId, raw.userId),
      ),
    )
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(trainingCycleStaff)
      .set({
        role: raw.role ?? existing.role,
        canCompleteLevel:
          raw.canCompleteLevel === undefined
            ? existing.canCompleteLevel
            : Boolean(raw.canCompleteLevel),
      })
      .where(eq(trainingCycleStaff.id, existing.id))
      .returning();
    return updated;
  }
  const [row] = await db
    .insert(trainingCycleStaff)
    .values({
      cycleId: raw.cycleId,
      userId: raw.userId,
      role: raw.role ?? "teacher",
      canCompleteLevel: Boolean(raw.canCompleteLevel),
    })
    .returning();
  return row;
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
  const db = getDb();
  const [cycle] = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.id, raw.cycleId))
    .limit(1);
  if (!cycle || cycle.status !== "active") {
    throw new DomainError(
      DomainErrorCode.DESTINATION_CYCLE_NOT_ACTIVE,
      "Solo ciclos activos admiten inscripción.",
    );
  }
  if (cycle.programId !== program.id) {
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
      DomainErrorCode.DESTINATION_ALREADY_ENROLLED,
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
        processType: LEVEL_PROCESS[raw.level],
        status: "in_progress",
        stage: `n${raw.level}`,
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
    processType: LEVEL_PROCESS[raw.level],
    eventType: "enrolled",
    fromStatus: progress?.status ?? null,
    toStatus: "in_progress",
    actorUserId,
    metadata: { cycleId: cycle.id, enrollmentId: enrollment.id, level: raw.level },
  });
  await writeAuditLog({
    actorUserId,
    action: "destination.enrolled",
    entityType: "training_enrollment",
    entityId: enrollment.id,
    metadata: { personId: raw.personId, level: raw.level, cycleId: cycle.id },
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
        .set({
          status: "academic_completed",
          updatedAt: new Date(),
        })
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
    const db = getDb();
    for (const requirementId of raw.overrideRequirementIds) {
      await db.insert(trainingRequirementOverrides).values({
        personId: raw.personId,
        programId: program.id,
        requirementId,
        reason: raw.overrideReason.trim(),
        actorUserId,
      });
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

  const program = await getProgramByLevel(raw.level);
  const programCycles = await db
    .select({ id: trainingCycles.id })
    .from(trainingCycles)
    .where(eq(trainingCycles.programId, program.id));
  const cycleIds = programCycles.map((c) => c.id);
  if (cycleIds.length > 0) {
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
      await db.insert(personProcessProgress).values({
        personId: raw.personId,
        processType: "destino_n2",
        status: "eligible",
        stage: "n2",
        currentStep: "apto_n2",
        ministryId: org.ministryId,
        networkId: org.networkId,
        metadata: { eligible_from_level: 1 },
      });
    } else if (nextProgress.status === "pending") {
      await db
        .update(personProcessProgress)
        .set({ status: "eligible", currentStep: "apto_n2", updatedAt: new Date() })
        .where(eq(personProcessProgress.id, nextProgress.id));
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
  const db = getDb();

  if (level === 1) {
    // Consolidar completed and N1 not completed (UDV is NOT a gate)
    const consolidarDone = await db
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
          eq(personProcessProgress.processType, "consolidar"),
          eq(personProcessProgress.status, "completed"),
        ),
      );
    const result = [];
    for (const row of consolidarDone) {
      if (!isSuperadmin(actor) && !canAccessMinistry(actor, row.ministryId)) continue;
      try {
        await assertProcessAccess(actor, row.personId, row.ministryId);
      } catch {
        continue;
      }
      const n1 = await getLevelProgress(row.personId, 1);
      if (n1?.status === "completed") continue;
      result.push({
        personId: row.personId,
        fullName: formatFullName(row.firstName, row.lastName),
        levelStatus: n1?.status ?? "eligible",
      });
    }
    return result;
  }

  if (level === 3) {
    // CD2 + Re-Encuentro completed
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
      const [re] = await db
        .select()
        .from(personProcessProgress)
        .where(
          and(
            eq(personProcessProgress.personId, row.personId),
            eq(personProcessProgress.processType, "reencuentro"),
            eq(personProcessProgress.status, "completed"),
          ),
        )
        .limit(1);
      if (!re) continue;
      const cur = await getLevelProgress(row.personId, 3);
      if (cur?.status === "completed") continue;
      result.push({
        personId: row.personId,
        fullName: formatFullName(row.firstName, row.lastName),
        levelStatus: cur?.status ?? "eligible",
      });
    }
    return result;
  }

  const prevLevel = (level - 1) as DestinoLevel;
  const prevDone = await db
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
        eq(personProcessProgress.processType, LEVEL_PROCESS[prevLevel]),
        eq(personProcessProgress.status, "completed"),
      ),
    );
  const result = [];
  for (const row of prevDone) {
    if (!isSuperadmin(actor) && !canAccessMinistry(actor, row.ministryId)) continue;
    try {
      await assertProcessAccess(actor, row.personId, row.ministryId);
    } catch {
      continue;
    }
    const cur = await getLevelProgress(row.personId, level);
    if (cur?.status === "completed") continue;
    result.push({
      personId: row.personId,
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
  const db = getDb();
  const conditions = [];
  if (!isSuperadmin(actor) && actor.ministryIds.length) {
    conditions.push(inArray(personProcessProgress.ministryId, actor.ministryIds));
  }
  const where =
    conditions.length === 0
      ? inArray(personProcessProgress.processType, [
          "destino_n1",
          "destino_n2",
          "destino_n3",
        ])
      : and(
          inArray(personProcessProgress.processType, [
            "destino_n1",
            "destino_n2",
            "destino_n3",
          ]),
          ...conditions,
        );

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
    rows
      .filter((r) => r.processType === type && statuses.includes(r.status))
      .reduce((acc, r) => acc + Number(r.c), 0);

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
  const db = getDb();
  if (level) {
    const program = await getProgramByLevel(level);
    return db
      .select()
      .from(trainingCycles)
      .where(eq(trainingCycles.programId, program.id))
      .orderBy(desc(trainingCycles.startDate));
  }
  const programs = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.family, DESTINO_FAMILY));
  const ids = programs.map((p) => p.id);
  if (!ids.length) return [];
  return db
    .select()
    .from(trainingCycles)
    .where(inArray(trainingCycles.programId, ids))
    .orderBy(desc(trainingCycles.startDate));
}

export async function getDestinoCycleBoard(actorUserId: string, cycleId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "destination.read") && !hasPermission(actor, "udv.read")) {
    throw new DomainError(DomainErrorCode.DESTINATION_ACCESS_DENIED, "Sin permiso.");
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

  const participants = [];
  for (const s of scoped) {
    const level = (program?.level ?? 1) as DestinoLevel;
    const evalReq = await evaluateLevelRequirements(s.enrollment.personId, level);
    participants.push({
      enrollmentId: s.enrollment.id,
      personId: s.enrollment.personId,
      fullName: formatFullName(s.firstName, s.lastName),
      status: s.enrollment.status,
      attendance: Object.fromEntries(
        attendanceRows
          .filter((a) => a.enrollmentId === s.enrollment.id)
          .map((a) => [a.moduleId, a]),
      ),
      pastoralPending: evalReq.academicPassed && !evalReq.pastoralPassed,
      memberCount:
        evalReq.results.find((r) => r.type === "active_cell_members")?.actual ?? null,
    });
  }

  return { cycle, program, modules, participants };
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
