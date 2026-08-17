/**
 * Phase 8 — Enviar workflow.
 * EM3 completed → eligible → completed.
 * Completing Enviar does NOT activate leadership or create cells.
 * Ungimiento reuses Phase 4 markPersonEligible (eligible ≠ active).
 */
import { z } from "zod";

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
import { markPersonEligible } from "@/modules/leadership/service";
import { api, getConvexHttpClient } from "@/server/convex";

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

async function getProgress(personId: string) {
  const client = getConvexHttpClient();
  const row = await client.query(api.send.getProgress, { personId: personId as Id<"persons"> });
  return row ? withId(row) : null;
}

async function getEm3Status(personId: string) {
  const client = getConvexHttpClient();
  return client.query(api.send.getEm3Status, { personId: personId as Id<"persons"> });
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
  const client = getConvexHttpClient();
  return withId(
    await client
      .mutation(api.send.ensureEligible, {
        personId: personId as Id<"persons">,
        ministryId: ministryId as Id<"ministries">,
        networkId: (networkId ?? undefined) as Id<"networks"> | undefined,
      })
      .catch(mapConvexError),
  );
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

  const client = getConvexHttpClient();
  const row = withId(
    await client
      .mutation(api.send.markEnviarProgress, {
        personId: input.personId as Id<"persons">,
        ministryId: org.ministryId as Id<"ministries">,
        networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
        actorUserId: actorUserId as Id<"users">,
        note: input.note,
      })
      .catch(mapConvexError),
  );

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

  const progress = await getProgress(input.personId);
  if (progress?.status === "completed") {
    throw new DomainError(DomainErrorCode.SEND_ALREADY_COMPLETED, "Enviar ya completado.");
  }

  const client = getConvexHttpClient();
  const updated = withId(
    await client
      .mutation(api.send.completeEnviar, {
        personId: input.personId as Id<"persons">,
        ministryId: org.ministryId as Id<"ministries">,
        networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
        actorUserId: actorUserId as Id<"users">,
        note: input.note,
      })
      .catch(mapConvexError),
  );

  await writeAuditLog({
    actorUserId,
    action: "send.completed",
    entityType: "person_process_progress",
    entityId: updated.id,
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
    progress: updated,
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

  const client = getConvexHttpClient();
  const lead = await client.query(api.leadership.getByPerson, {
    personId: input.personId as Id<"persons">,
  });

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
  const client = getConvexHttpClient();

  let personIds: Id<"persons">[] | undefined;
  let ministryIds: Id<"ministries">[] | undefined;
  if (isSuperadmin(actor)) {
    // global
  } else if (isLeaderGeneral(actor) && actor.ministryIds.length) {
    ministryIds = actor.ministryIds as Id<"ministries">[];
  } else if (focusLeaderPersonId || actor.personId) {
    const root = (focusLeaderPersonId ?? actor.personId!) as Id<"persons">;
    personIds = await client.query(api.formation.getDescendantPersonIds, { rootPersonId: root });
  } else if (actor.ministryIds.length) {
    ministryIds = actor.ministryIds as Id<"ministries">[];
  }

  const rows = await client.query(api.formation.listProgressRows, {
    processTypes: [PROCESS],
    personIds,
    ministryIds,
  });

  const pick = (status: string) => rows.filter((r) => r.progress.status === status).length;

  const completedPersonIds = rows
    .filter((r) => r.progress.status === "completed")
    .map((r) => r.progress.personId);
  let ungidos = 0;
  let activados = 0;
  if (completedPersonIds.length) {
    const leads = await client.query(api.leadership.getManyByPersons, {
      personIds: completedPersonIds,
    });
    ungidos = leads.filter((l) => l.status === "eligible").length;
    activados = leads.filter((l) => l.status === "active").length;
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
  const client = getConvexHttpClient();
  const ministryIds =
    !isSuperadmin(actor) && actor.ministryIds.length
      ? (actor.ministryIds as Id<"ministries">[])
      : undefined;
  const rows = await client.query(api.send.listSendPeople, {
    status: filters.status as never,
    ministryIds,
    limit: filters.pageSize ?? 50,
  });

  return rows.map((r) => ({
    ...withId(r.progress),
    fullName: formatFullName(r.firstName, r.lastName),
    statusLabel: statusLabel(r.progress.status),
    leadershipStatus: r.leadershipStatus,
    leadershipActive: r.leadershipStatus === "active",
  }));
}

export async function getPersonSendSummary(personId: string) {
  const client = getConvexHttpClient();
  const summary = await client.query(api.send.getPersonSendSummary, {
    personId: personId as Id<"persons">,
  });
  return {
    status: summary.status,
    label: statusLabel(summary.status),
    leadershipStatus: summary.leadershipStatus,
    leadershipEligible: summary.leadershipStatus === "eligible",
    leadershipActive: summary.leadershipStatus === "active",
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
