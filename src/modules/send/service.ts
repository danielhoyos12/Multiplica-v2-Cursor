/**
 * Phase 8 — Enviar workflow.
 * EM3 completed → eligible → completed.
 * Completing Enviar does NOT activate leadership or create cells.
 * Ungimiento reuses Phase 4 markPersonEligible (eligible ≠ active).
 */
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import {
  personOrganizationHistory,
  personProcessEvents,
  personProcessProgress,
  personLeadership,
  persons,
} from "@/db/schema";
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
import { markPersonEligible } from "@/modules/leadership/service";

const PROCESS = "enviar" as const;

export const startSendInputSchema = z.object({
  personId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export const completeSendInputSchema = z.object({
  personId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
  markEligible: z.boolean().optional().default(false),
});

export const anointAfterSendInputSchema = z.object({
  personId: z.string().min(1),
  ministryId: z.string().min(1),
  networkId: z.string().min(1),
  directLeaderPersonId: z.string().min(1).optional().nullable(),
});

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

async function getProgress(personId: string) {
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

async function getEm3Status(personId: string) {
  const db = getDb();
  const [row] = await db
    .select({ status: personProcessProgress.status })
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, "em3"),
      ),
    )
    .limit(1);
  return row?.status ?? null;
}

export async function assertSendEligible(personId: string) {
  const em3 = await getEm3Status(personId);
  if (em3 !== "completed") {
    throw new DomainError(
      DomainErrorCode.SEND_NOT_ELIGIBLE,
      "Escuela Ministerial 3 debe estar completada.",
    );
  }
}

export async function isSendEligible(personId: string) {
  try {
    await assertSendEligible(personId);
    const cur = await getProgress(personId);
    if (cur?.status === "completed") return false;
    return true;
  } catch {
    return false;
  }
}

export async function ensureSendEligible(
  personId: string,
  ministryId: string,
  networkId: string | null,
) {
  await assertSendEligible(personId);
  const existing = await getProgress(personId);
  if (existing) {
    if (existing.status === "pending") {
      const db = getDb();
      const [row] = await db
        .update(personProcessProgress)
        .set({
          status: "eligible",
          currentStep: "apto_enviar",
          updatedAt: new Date(),
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
      stage: "enviar",
      currentStep: "apto_enviar",
      ministryId,
      networkId,
      metadata: { from: "em3_completed" },
    })
    .returning();
  return row;
}

export async function startSend(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = startSendInputSchema.parse(raw);
  assertCanMutate(actor, "send.manage", { type: "process", personId: input.personId });

  await assertSendEligible(input.personId);
  const org = await currentOrg(input.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia organizacional.");
  }
  await assertProcessAccess(actor, input.personId, org.ministryId);

  const existing = await getProgress(input.personId);
  if (existing?.status === "completed") {
    throw new DomainError(DomainErrorCode.SEND_ALREADY_COMPLETED, "Enviar ya completado.");
  }

  const db = getDb();
  let row = existing;
  if (!row) {
    [row] = await db
      .insert(personProcessProgress)
      .values({
        personId: input.personId,
        processType: PROCESS,
        status: "in_progress",
        stage: "enviar",
        currentStep: "en_proceso",
        ministryId: org.ministryId,
        networkId: org.networkId,
        startedAt: new Date(),
        metadata: {},
      })
      .returning();
  } else if (row.status !== "in_progress") {
    [row] = await db
      .update(personProcessProgress)
      .set({
        status: "in_progress",
        currentStep: "en_proceso",
        startedAt: row.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(personProcessProgress.id, row.id))
      .returning();
  }

  await db.insert(personProcessEvents).values({
    progressId: row.id,
    personId: input.personId,
    processType: PROCESS,
    eventType: "started",
    fromStatus: existing?.status ?? null,
    toStatus: "in_progress",
    actorUserId,
    note: input.note ?? null,
    metadata: {},
  });
  await writeAuditLog({
    actorUserId,
    action: "send.started",
    entityType: "person_process_progress",
    entityId: row.id,
    metadata: { personId: input.personId },
  });
  return row;
}

/**
 * Completar Enviar. Optionally mark leadership eligible (ungir) via Phase 4.
 * NEVER sets leadership to active / NEVER creates cell / NEVER creates credentials.
 */
export async function completeSend(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = completeSendInputSchema.parse(raw);
  assertCanMutate(actor, "send.complete", { type: "process", personId: input.personId });

  await assertSendEligible(input.personId);
  const org = await currentOrg(input.personId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia organizacional.");
  }
  await assertProcessAccess(actor, input.personId, org.ministryId);

  let progress = await getProgress(input.personId);
  if (progress?.status === "completed") {
    throw new DomainError(DomainErrorCode.SEND_ALREADY_COMPLETED, "Enviar ya completado.");
  }

  const db = getDb();
  if (!progress) {
    [progress] = await db
      .insert(personProcessProgress)
      .values({
        personId: input.personId,
        processType: PROCESS,
        status: "completed",
        stage: "enviar",
        currentStep: "completado",
        ministryId: org.ministryId,
        networkId: org.networkId,
        startedAt: new Date(),
        completedAt: new Date(),
        completedByUserId: actorUserId,
        metadata: {
          leadership_activated: false,
          cell_created: false,
        },
      })
      .returning();
  } else {
    [progress] = await db
      .update(personProcessProgress)
      .set({
        status: "completed",
        currentStep: "completado",
        completedAt: new Date(),
        completedByUserId: actorUserId,
        updatedAt: new Date(),
        metadata: {
          ...(progress.metadata ?? {}),
          leadership_activated: false,
          cell_created: false,
        },
      })
      .where(eq(personProcessProgress.id, progress.id))
      .returning();
  }

  await db.insert(personProcessEvents).values({
    progressId: progress.id,
    personId: input.personId,
    processType: PROCESS,
    eventType: "completed",
    toStatus: "completed",
    actorUserId,
    note: input.note ?? null,
    metadata: { leadership_activated: false },
  });
  await writeAuditLog({
    actorUserId,
    action: "send.completed",
    entityType: "person_process_progress",
    entityId: progress.id,
    metadata: {
      personId: input.personId,
      leadership_activated: false,
      cell_created: false,
      markEligible: Boolean(input.markEligible),
    },
  });

  let leadershipEligible = false;
  if (input.markEligible && org.networkId) {
    await markPersonEligible(actorUserId, {
      personId: input.personId,
      ministryId: org.ministryId,
      networkId: org.networkId,
    });
    leadershipEligible = true;
    await writeAuditLog({
      actorUserId,
      action: "leader.marked_eligible",
      entityType: "person_leadership",
      entityId: input.personId,
      metadata: {
        personId: input.personId,
        via: "send.complete",
        active: false,
      },
    });
  }

  return {
    progress,
    leadershipActivated: false as const,
    cellCreated: false as const,
    leadershipEligible,
  };
}

/** Explicit anoint after send — reuses Phase 4 markPersonEligible. */
export async function anointAfterSend(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = anointAfterSendInputSchema.parse(raw);
  assertCanMutate(actor, "leaders.mark_eligible", {
    type: "leader",
    personId: input.personId,
    ministryId: input.ministryId,
  });

  const progress = await getProgress(input.personId);
  if (progress?.status !== "completed") {
    throw new DomainError(
      DomainErrorCode.SEND_NOT_ELIGIBLE,
      "Complete Enviar antes de ungir (o use markEligible Phase 4 aparte).",
    );
  }

  const result = await markPersonEligible(actorUserId, {
    personId: input.personId,
    ministryId: input.ministryId,
    networkId: input.networkId,
    directLeaderPersonId: input.directLeaderPersonId ?? undefined,
  });

  const [lead] = await getDb()
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, input.personId))
    .limit(1);

  return {
    leadership: result,
    status: lead?.status ?? "eligible",
    isActive: lead?.status === "active",
  };
}

export async function getSendDashboardCounts(actorUserId: string, focusLeaderPersonId?: string | null) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "send.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.SEND_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const conditions = [eq(personProcessProgress.processType, PROCESS)];
  if (isSuperadmin(actor)) {
    // global
  } else if (isLeaderGeneral(actor) && actor.ministryIds.length) {
    conditions.push(inArray(personProcessProgress.ministryId, actor.ministryIds));
  } else if (focusLeaderPersonId || actor.personId) {
    const root = focusLeaderPersonId ?? actor.personId!;
    conditions.push(
      sql`${personProcessProgress.personId} IN (
        SELECT descendant_person_id FROM leadership_closure
        WHERE ancestor_person_id = ${root}::uuid
      )`,
    );
  } else if (actor.ministryIds.length) {
    conditions.push(inArray(personProcessProgress.ministryId, actor.ministryIds));
  }

  const rows = await db
    .select({
      status: personProcessProgress.status,
      c: count(),
    })
    .from(personProcessProgress)
    .where(and(...conditions))
    .groupBy(personProcessProgress.status);

  const pick = (status: string) =>
    Number(rows.find((r) => r.status === status)?.c ?? 0);

  // Leadership eligible/active among people who completed send (scoped)
  const completedPeople = await db
    .select({ personId: personProcessProgress.personId })
    .from(personProcessProgress)
    .where(and(...conditions, eq(personProcessProgress.status, "completed")));
  const ids = completedPeople.map((p) => p.personId);
  let ungidos = 0;
  let activados = 0;
  if (ids.length) {
    const leads = await db
      .select({ status: personLeadership.status, c: count() })
      .from(personLeadership)
      .where(inArray(personLeadership.personId, ids))
      .groupBy(personLeadership.status);
    ungidos = Number(leads.find((l) => l.status === "eligible")?.c ?? 0);
    activados = Number(leads.find((l) => l.status === "active")?.c ?? 0);
  }

  return {
    eligible: pick("eligible"),
    inProgress: pick("in_progress"),
    completed: pick("completed"),
    ungidos,
    activados,
  };
}

export async function listSendPeople(
  actorUserId: string,
  filters: { status?: string; pageSize?: number } = {},
) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "send.read") && !hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.SEND_ACCESS_DENIED, "Sin permiso.");
  }
  const db = getDb();
  const conditions = [eq(personProcessProgress.processType, PROCESS)];
  if (filters.status) {
    conditions.push(eq(personProcessProgress.status, filters.status as never));
  }
  if (!isSuperadmin(actor) && actor.ministryIds.length) {
    conditions.push(inArray(personProcessProgress.ministryId, actor.ministryIds));
  }
  const rows = await db
    .select({
      progress: personProcessProgress,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(personProcessProgress)
    .innerJoin(persons, eq(persons.id, personProcessProgress.personId))
    .where(and(...conditions))
    .orderBy(desc(personProcessProgress.updatedAt))
    .limit(filters.pageSize ?? 50);

  const personIds = rows.map((r) => r.progress.personId);
  const leads =
    personIds.length === 0
      ? []
      : await db
          .select()
          .from(personLeadership)
          .where(inArray(personLeadership.personId, personIds));
  const leadByPerson = new Map(leads.map((l) => [l.personId, l]));

  return rows.map((r) => {
    const lead = leadByPerson.get(r.progress.personId);
    return {
      ...r.progress,
      fullName: formatFullName(r.firstName, r.lastName),
      statusLabel: statusLabel(r.progress.status),
      leadershipStatus: lead?.status ?? "none",
      leadershipActive: lead?.status === "active",
    };
  });
}

export async function getPersonSendSummary(personId: string) {
  const progress = await getProgress(personId);
  const [lead] = await getDb()
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, personId))
    .limit(1);
  return {
    status: progress?.status ?? "pending",
    label: statusLabel(progress?.status ?? "pending"),
    leadershipStatus: lead?.status ?? "none",
    leadershipEligible: lead?.status === "eligible",
    leadershipActive: lead?.status === "active",
  };
}

export const SendRules = {
  canEnter(em3Status: string | null | undefined) {
    return em3Status === "completed";
  },
  completingDoesNotActivateLeader: true as const,
  completingDoesNotCreateCell: true as const,
  ungidoIsNotActive: true as const,
  eligibleDoesNotMeanCompleted: true as const,
};
