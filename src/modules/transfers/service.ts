/**
 * Phase 8 — Pastoral transfer engine.
 * Preview → request → approve → execute. NEVER loses persons. NEVER
 * creates a third cell. NEVER invents history. Thin Next.js wrapper over
 * `convex/transfers.ts` — reads are done here (for validation/preview
 * messaging), state changes are delegated to Convex mutations which run
 * atomically server-side.
 */
import { z } from "zod";

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
  type NetworkCode,
} from "@/modules/authorization";
import { formatFullName } from "@/modules/ganar/normalize";
import { assertTreeAccess, isDescendantOf } from "@/modules/leadership/service";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

const MAX_DIRECT_LEADERS = 12;

export const createTransferInputSchema = z.object({
  personId: z.string().min(1),
  transferType: z.enum([
    "network_change",
    "ministry_change",
    "cell_membership_transfer",
    "direct_leader_change",
    "subtree_move",
    "cell_reassignment",
    "leader_deactivation",
  ]),
  structureMode: z
    .enum([
      "move_with_structure",
      "move_person_only_and_reassign_structure",
      "not_applicable",
    ])
    .optional()
    .default("not_applicable"),
  destinationMinistryId: z.string().min(1).optional().nullable(),
  destinationNetworkId: z.string().min(1).optional().nullable(),
  proposedDirectLeaderPersonId: z.string().min(1).optional().nullable(),
  targetCellId: z.string().min(1).optional().nullable(),
  reason: z.string().trim().min(5).max(1000),
  /** Member reassignment map for deactivation / saturated receptor */
  memberResolutions: z
    .array(
      z.object({
        personId: z.string().min(1),
        targetCellId: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
  /** Direct leader reassignment for deactivation */
  directLeaderResolutions: z
    .array(
      z.object({
        personId: z.string().min(1),
        newDirectLeaderPersonId: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
  submit: z.boolean().optional().default(true),
});

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

async function getNetworkCode(networkId: string): Promise<NetworkCode> {
  const client = await getAuthenticatedConvexClient();
  const n = await client.query(api.organization.getNetwork, {
    networkId: networkId as Id<"networks">,
  });
  if (!n) throw new DomainError(DomainErrorCode.NOT_FOUND, "Red no encontrada.");
  return n.code as NetworkCode;
}

async function getLeadership(personId: string) {
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.leadership.getByPerson, {
    personId: personId as Id<"persons">,
  });
  return row ? withId(row) : null;
}

async function countDirectActive(leaderPersonId: string) {
  const client = await getAuthenticatedConvexClient();
  return client.query(api.leadership.countActiveDirectLeadersFor, {
    leaderPersonId: leaderPersonId as Id<"persons">,
  });
}

async function listOpenCells(responsiblePersonId: string) {
  const client = await getAuthenticatedConvexClient();
  const rows = await client.query(api.cells.listByResponsible, {
    responsiblePersonId: responsiblePersonId as Id<"persons">,
  });
  return rows.filter((c) => c.status !== "closed").map(withId);
}

async function countActiveMembers(cellId: string) {
  const client = await getAuthenticatedConvexClient();
  const [row] = await client.query(api.cells.countActiveMembers, {
    cellIds: [cellId as Id<"cells">],
  });
  return row?.count ?? 0;
}

async function listSubtreePersonIds(rootPersonId: string) {
  const client = await getAuthenticatedConvexClient();
  const rows = await client.query(api.leadership.listDescendants, {
    ancestorPersonId: rootPersonId as Id<"persons">,
  });
  return rows.map((r) => r.personId as string);
}

/**
 * Repairs the leadership closure table for `ministryId` after a
 * subtree/direct-leader move. Convex's `transfers.execute` already
 * rebuilds closure for every affected Ministry on execution — this is
 * kept for API compatibility with callers that repair closure directly
 * (e.g. maintenance scripts), and now delegates to a full Ministry
 * rebuild (`leadership.rebuildClosureForMinistry`) rather than a bespoke
 * subtree BFS — correct, simpler, and O(active leaders in ministry).
 */
export async function rebuildClosureForSubtree(
  rootPersonId: string,
  newDirectLeaderPersonId: string | null,
  ministryId: string,
) {
  const client = await getAuthenticatedConvexClient();
  const result = await client
    .mutation(api.leadership.rebuildClosureForMinistry, { ministryId: ministryId as Id<"ministries"> })
    .catch(mapConvexError);
  await writeAuditLog({
    action: "closure.rebuilt",
    entityType: "leadership_closure",
    entityId: rootPersonId,
    metadata: {
      rootPersonId,
      newDirectLeaderPersonId,
      leadersProcessed: result.leadersProcessed,
      edgesInserted: result.edgesInserted,
    },
  });
}

export type TransferPreview = {
  personId: string;
  personName: string;
  transferType: string;
  sourceMinistryId: string | null;
  sourceNetworkId: string | null;
  destinationMinistryId: string | null;
  destinationNetworkId: string | null;
  proposedDirectLeaderPersonId: string | null;
  cellsAffected: number;
  descendantsAffected: number;
  membersAffected: number;
  directLeadersAffected: number;
  structureMode: string;
  warnings: string[];
  blockers: string[];
  canExecute: boolean;
};

export async function previewTransfer(
  actorUserId: string,
  raw: unknown,
): Promise<TransferPreview> {
  const actor = await requireActor(actorUserId);
  const input = createTransferInputSchema.parse(raw);
  const org = await currentOrg(input.personId);
  const client = await getAuthenticatedConvexClient();
  const person = await client.query(api.persons.getById, {
    personId: input.personId as Id<"persons">,
  });
  if (!person) throw new DomainError(DomainErrorCode.NOT_FOUND, "Persona no encontrada.");

  if (org?.ministryId) {
    await assertTreeAccess(actor, input.personId, org.ministryId);
  }

  const leadership = await getLeadership(input.personId);
  const openCells = await listOpenCells(input.personId);
  const descendants = await listSubtreePersonIds(input.personId);
  let membersAffected = 0;
  for (const cell of openCells) {
    membersAffected += await countActiveMembers(cell.id);
  }
  const directLeaders = leadership?.status === "active" ? await countDirectActive(input.personId) : 0;

  const warnings: string[] = [];
  const blockers: string[] = [];

  const destMinistryId = input.destinationMinistryId ?? org?.ministryId ?? null;
  const destNetworkId = input.destinationNetworkId ?? org?.networkId ?? null;

  if (input.transferType === "network_change") {
    if (!input.destinationNetworkId) {
      blockers.push("Red destino requerida.");
    } else if (org?.networkId) {
      const from = await getNetworkCode(org.networkId);
      const to = await getNetworkCode(input.destinationNetworkId);
      if (from === to) warnings.push("Misma Red origen/destino.");
    }
  }

  if (input.transferType === "ministry_change") {
    if (!input.destinationMinistryId) blockers.push("Ministerio destino requerido.");
    if (
      input.destinationMinistryId &&
      org?.ministryId &&
      input.destinationMinistryId !== org.ministryId &&
      !isSuperadmin(actor) &&
      !isLeaderGeneral(actor)
    ) {
      warnings.push("Cross-ministry: requiere aprobación explícita.");
    }
  }

  if (input.transferType === "subtree_move" || input.transferType === "direct_leader_change") {
    if (!input.proposedDirectLeaderPersonId) {
      blockers.push("Nuevo líder directo requerido.");
    } else {
      if (input.proposedDirectLeaderPersonId === input.personId) {
        blockers.push("No puede ser su propio líder directo.");
      }
      if (await isDescendantOf(input.personId, input.proposedDirectLeaderPersonId)) {
        blockers.push("Ciclo: destino es descendiente del nodo movido.");
      }
      const parentLead = await getLeadership(input.proposedDirectLeaderPersonId);
      if (!parentLead || parentLead.status !== "active") {
        blockers.push("El nuevo líder directo debe estar active.");
      } else {
        const cap = await countDirectActive(input.proposedDirectLeaderPersonId);
        if (
          leadership?.directLeaderPersonId !== input.proposedDirectLeaderPersonId &&
          cap >= MAX_DIRECT_LEADERS
        ) {
          blockers.push("Capacidad de 12 líderes directos alcanzada.");
        }
        if (
          destMinistryId &&
          parentLead.ministryId !== destMinistryId &&
          input.structureMode === "move_with_structure"
        ) {
          warnings.push("Subárbol cruzará Ministerio con el líder destino.");
        }
      }
    }
  }

  if (input.transferType === "leader_deactivation") {
    if (directLeaders > 0 || openCells.length > 0) {
      const resolvedMembers = new Set(input.memberResolutions.map((m) => m.personId));
      const resolvedLeaders = new Set(input.directLeaderResolutions.map((d) => d.personId));
      for (const cell of openCells) {
        const detail = await client.query(api.cells.getDetail, { cellId: cell.id as Id<"cells"> });
        for (const m of detail?.members ?? []) {
          if (m.status !== "active") continue;
          if (!resolvedMembers.has(m.personId) && m.personId !== input.personId) {
            blockers.push(`Miembro sin resolución: ${m.personId}`);
          }
        }
      }
      const directs = await client.query(api.leadership.listDirectLeaders, {
        leaderPersonId: input.personId as Id<"persons">,
      });
      for (const d of directs) {
        if (!resolvedLeaders.has(d.personId)) {
          blockers.push(`Líder directo sin resolución: ${d.personId}`);
        }
      }
      if (blockers.length) {
        blockers.unshift("Plan de desactivación incompleto.");
      }
    }
  }

  if (input.transferType === "cell_membership_transfer" && !input.targetCellId) {
    blockers.push("Célula destino requerida.");
  }

  return {
    personId: input.personId,
    personName: formatFullName(person.firstName, person.lastName),
    transferType: input.transferType,
    sourceMinistryId: org?.ministryId ?? null,
    sourceNetworkId: org?.networkId ?? null,
    destinationMinistryId: destMinistryId,
    destinationNetworkId: destNetworkId,
    proposedDirectLeaderPersonId: input.proposedDirectLeaderPersonId ?? null,
    cellsAffected: openCells.length,
    descendantsAffected: descendants.length,
    membersAffected,
    directLeadersAffected: directLeaders,
    structureMode: input.structureMode ?? "not_applicable",
    warnings,
    blockers,
    canExecute: blockers.length === 0,
  };
}

export async function createTransferRequest(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = createTransferInputSchema.parse(raw);
  assertCanMutate(actor, "transfers.request", {
    type: "person",
    personId: input.personId,
  });

  const preview = await previewTransfer(actorUserId, input);
  if (!preview.canExecute && input.transferType === "leader_deactivation") {
    if (input.submit) {
      throw new DomainError(
        DomainErrorCode.REASSIGNMENT_INCOMPLETE,
        "Plan de desactivación incompleto.",
        { blockers: preview.blockers },
      );
    }
  } else if (!preview.canExecute && input.submit) {
    throw new DomainError(
      DomainErrorCode.TRANSFER_INVALID_DESTINATION,
      preview.blockers[0] ?? "Transferencia inválida.",
      { blockers: preview.blockers },
    );
  }

  const crossMinistry = Boolean(
    preview.sourceMinistryId &&
      preview.destinationMinistryId &&
      preview.sourceMinistryId !== preview.destinationMinistryId,
  );

  const status =
    input.submit && crossMinistry && !isSuperadmin(actor)
      ? "pending"
      : input.submit
        ? crossMinistry && isSuperadmin(actor)
          ? "approved"
          : "pending"
        : "draft";

  let finalStatus = status;
  if (input.submit && !crossMinistry && (isSuperadmin(actor) || isLeaderGeneral(actor))) {
    finalStatus = "approved";
  }

  const client = await getAuthenticatedConvexClient();
  const row = withId(
    await client
      .mutation(api.transfers.createRequest, {
        personId: input.personId as Id<"persons">,
        transferType: input.transferType,
        structureMode: input.structureMode ?? "not_applicable",
        status: finalStatus as never,
        requestedByUserId: actorUserId as Id<"users">,
        sourceMinistryId: (preview.sourceMinistryId ?? undefined) as Id<"ministries"> | undefined,
        sourceNetworkId: (preview.sourceNetworkId ?? undefined) as Id<"networks"> | undefined,
        destinationMinistryId: (preview.destinationMinistryId ?? undefined) as
          | Id<"ministries">
          | undefined,
        destinationNetworkId: (preview.destinationNetworkId ?? undefined) as
          | Id<"networks">
          | undefined,
        proposedDirectLeaderPersonId: (input.proposedDirectLeaderPersonId ?? undefined) as
          | Id<"persons">
          | undefined,
        targetCellId: (input.targetCellId ?? undefined) as Id<"cells"> | undefined,
        reason: input.reason,
        plan: {
          preview,
          memberResolutions: input.memberResolutions,
          directLeaderResolutions: input.directLeaderResolutions,
        },
        metadata: { crossMinistry },
      })
      .catch(mapConvexError),
  );

  await writeAuditLog({
    actorUserId,
    action: "transfer.requested",
    entityType: "pastoral_transfer_requests",
    entityId: row.id,
    metadata: {
      transferType: input.transferType,
      status: finalStatus,
      personId: input.personId,
    },
  });

  return { request: row, preview };
}

export async function approveTransfer(actorUserId: string, requestId: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "transfers.approve", { type: "person" });
  const client = await getAuthenticatedConvexClient();

  const row = await client.query(api.transfers.getRequest, {
    requestId: requestId as Id<"pastoralTransferRequests">,
  });
  if (!row) throw new DomainError(DomainErrorCode.TRANSFER_NOT_FOUND, "Solicitud no encontrada.");
  if (row.status === "executed") {
    throw new DomainError(DomainErrorCode.TRANSFER_ALREADY_EXECUTED, "Ya ejecutada.");
  }
  if (row.status !== "pending" && row.status !== "draft") {
    throw new DomainError(DomainErrorCode.TRANSFER_NOT_APPROVED, `Estado actual: ${row.status}`);
  }
  if (
    row.sourceMinistryId &&
    row.destinationMinistryId &&
    row.sourceMinistryId !== row.destinationMinistryId &&
    !isSuperadmin(actor) &&
    !(
      isLeaderGeneral(actor) &&
      (canAccessMinistry(actor, row.sourceMinistryId) ||
        canAccessMinistry(actor, row.destinationMinistryId))
    )
  ) {
    throw new DomainError(
      DomainErrorCode.TRANSFER_CROSS_MINISTRY_APPROVAL_REQUIRED,
      "Aprobación cross-ministry no autorizada.",
    );
  }

  const updated = withId(
    await client
      .mutation(api.transfers.approve, {
        requestId: requestId as Id<"pastoralTransferRequests">,
      })
      .catch(mapConvexError),
  );

  await writeAuditLog({
    actorUserId,
    action: "transfer.approved",
    entityType: "pastoral_transfer_requests",
    entityId: updated.id,
    metadata: { personId: updated.personId },
  });
  return updated;
}

export async function rejectTransfer(actorUserId: string, requestId: string, reason: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "transfers.approve", { type: "person" });
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.transfers.getRequest, {
    requestId: requestId as Id<"pastoralTransferRequests">,
  });
  if (!row) throw new DomainError(DomainErrorCode.TRANSFER_NOT_FOUND, "Solicitud no encontrada.");
  if (row.status === "executed") {
    throw new DomainError(DomainErrorCode.TRANSFER_ALREADY_EXECUTED, "Ya ejecutada.");
  }
  const updated = withId(
    await client
      .mutation(api.transfers.reject, {
        requestId: requestId as Id<"pastoralTransferRequests">,
        reason,
      })
      .catch(mapConvexError),
  );
  await writeAuditLog({
    actorUserId,
    action: "transfer.rejected",
    entityType: "pastoral_transfer_requests",
    entityId: updated.id,
    metadata: { personId: updated.personId, reason },
  });
  return updated;
}

/**
 * Execute approved transfer. `convex/transfers.ts` `execute` runs the
 * org-history/direct-leader/cell-transfer/deactivation-plan updates and
 * closure rebuild atomically server-side (single Convex mutation).
 */
export async function executePastoralTransfer(actorUserId: string, requestId: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "transfers.execute", { type: "person" });
  const client = await getAuthenticatedConvexClient();

  const req = await client.query(api.transfers.getRequest, {
    requestId: requestId as Id<"pastoralTransferRequests">,
  });
  if (!req) throw new DomainError(DomainErrorCode.TRANSFER_NOT_FOUND, "Solicitud no encontrada.");
  if (req.status === "executed") {
    throw new DomainError(DomainErrorCode.TRANSFER_ALREADY_EXECUTED, "Ya ejecutada.");
  }
  if (req.status !== "approved") {
    throw new DomainError(
      DomainErrorCode.TRANSFER_NOT_APPROVED,
      "La transferencia debe estar aprobada.",
    );
  }

  const executed = withId(
    await client
      .mutation(api.transfers.execute, {
        requestId: requestId as Id<"pastoralTransferRequests">,
      })
      .catch(mapConvexError),
  );

  await writeAuditLog({
    actorUserId,
    action: "transfer.executed",
    entityType: "pastoral_transfer_requests",
    entityId: executed.id,
    metadata: {
      personId: executed.personId,
      transferType: executed.transferType,
    },
  });

  return executed;
}

export async function listTransferRequests(
  actorUserId: string,
  filters: { status?: string } = {},
) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "transfers.read")) {
    throw new DomainError(DomainErrorCode.TRANSFER_INVALID_ACTOR, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const ministryIds =
    !isSuperadmin(actor) && actor.ministryIds.length
      ? (actor.ministryIds as Id<"ministries">[])
      : undefined;
  const rows = await client.query(api.transfers.listRequests, {
    status: filters.status as never,
    ministryIds,
    requestedByUserId: actor.userId as Id<"users">,
  });

  return rows.map((r) => ({
    ...withId(r.request),
    fullName: formatFullName(r.firstName, r.lastName),
  }));
}

export async function buildDeactivationPlan(actorUserId: string, personId: string) {
  const actor = await requireActor(actorUserId);
  const leadership = await getLeadership(personId);
  if (!leadership || leadership.status !== "active") {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Líder activo no encontrado.");
  }
  await assertTreeAccess(actor, personId, leadership.ministryId);

  const openCells = await listOpenCells(personId);
  const client = await getAuthenticatedConvexClient();
  const members: Array<{
    personId: string;
    fullName: string;
    cellId: string;
    cellType: string;
  }> = [];
  for (const cell of openCells) {
    const detail = await client.query(api.cells.getDetail, { cellId: cell.id as Id<"cells"> });
    for (const m of detail?.members ?? []) {
      if (m.status !== "active" || m.personId === personId) continue;
      members.push({
        personId: m.personId as string,
        fullName: formatFullName(m.firstName, m.lastName),
        cellId: cell.id,
        cellType: cell.type,
      });
    }
  }
  const directs = await client.query(api.leadership.listDirectLeaders, {
    leaderPersonId: personId as Id<"persons">,
  });

  return {
    personId,
    cells: openCells.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      memberCount: members.filter((m) => m.cellId === c.id).length,
    })),
    members,
    directLeaders: directs.map((d) => ({
      personId: d.personId as string,
      fullName: formatFullName(d.firstName, d.lastName),
    })),
    requiresPlan: openCells.length > 0 || directs.length > 0,
  };
}

export const TransferRules = {
  neverLosePersons: true as const,
  maxDirectCells: 2 as const,
  maxDirectLeaders: MAX_DIRECT_LEADERS,
  executedIsIdempotent: true as const,
  closureIsNotHistory: true as const,
};
