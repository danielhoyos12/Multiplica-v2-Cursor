/**
 * Phase 8 — Pastoral transfer engine.
 * Atomic preview → request → approve → execute with closure rebuild.
 * NEVER loses persons. NEVER creates a third cell. NEVER invents history.
 */
import { and, count, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import {
  cellLeadershipHistory,
  cellMemberships,
  cells,
  leadershipClosure,
  leadershipRelationshipHistory,
  networks,
  pastoralTransferRequests,
  personLeadership,
  personOrganizationHistory,
  persons,
  userRoleAssignments,
  users,
} from "@/db/schema";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { writeAuditLog } from "@/modules/audit";
import {
  assertCanMutate,
  canAccessMinistry,
  canJoinCellNetwork,
  hasPermission,
  isLeaderGeneral,
  isSuperadmin,
  loadAuthContext,
  type AuthContext,
  type NetworkCode,
} from "@/modules/authorization";
import { formatFullName } from "@/modules/ganar/normalize";
import {
  assertTreeAccess,
  isDescendantOf,
} from "@/modules/leadership/service";

const MAX_DIRECT_LEADERS = 12;

export const createTransferInputSchema = z.object({
  personId: z.string().uuid(),
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
  destinationMinistryId: z.string().uuid().optional().nullable(),
  destinationNetworkId: z.string().uuid().optional().nullable(),
  proposedDirectLeaderPersonId: z.string().uuid().optional().nullable(),
  targetCellId: z.string().uuid().optional().nullable(),
  reason: z.string().trim().min(5).max(1000),
  /** Member reassignment map for deactivation / saturated receptor */
  memberResolutions: z
    .array(
      z.object({
        personId: z.string().uuid(),
        targetCellId: z.string().uuid(),
      }),
    )
    .optional()
    .default([]),
  /** Direct leader reassignment for deactivation */
  directLeaderResolutions: z
    .array(
      z.object({
        personId: z.string().uuid(),
        newDirectLeaderPersonId: z.string().uuid(),
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
  const db = getDb();
  const [row] = await db
    .select()
    .from(personOrganizationHistory)
    .where(
      and(
        eq(personOrganizationHistory.personId, personId),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .orderBy(desc(personOrganizationHistory.effectiveFrom))
    .limit(1);
  return row ?? null;
}

async function getNetworkCode(networkId: string): Promise<NetworkCode> {
  const db = getDb();
  const [n] = await db.select().from(networks).where(eq(networks.id, networkId)).limit(1);
  if (!n) throw new DomainError(DomainErrorCode.NOT_FOUND, "Red no encontrada.");
  return n.code as NetworkCode;
}

async function getLeadership(personId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, personId))
    .limit(1);
  return row ?? null;
}

async function countDirectActive(leaderPersonId: string) {
  const db = getDb();
  const [{ c }] = await db
    .select({ c: count() })
    .from(personLeadership)
    .where(
      and(
        eq(personLeadership.directLeaderPersonId, leaderPersonId),
        eq(personLeadership.status, "active"),
      ),
    );
  return Number(c);
}

async function listOpenCells(responsiblePersonId: string) {
  const db = getDb();
  return db
    .select()
    .from(cells)
    .where(
      and(eq(cells.responsiblePersonId, responsiblePersonId), ne(cells.status, "closed")),
    );
}

async function countActiveMembers(cellId: string) {
  const db = getDb();
  const [{ c }] = await db
    .select({ c: count() })
    .from(cellMemberships)
    .where(and(eq(cellMemberships.cellId, cellId), eq(cellMemberships.status, "active")));
  return Number(c);
}

async function listSubtreePersonIds(rootPersonId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: leadershipClosure.descendantPersonId })
    .from(leadershipClosure)
    .where(
      and(
        eq(leadershipClosure.ancestorPersonId, rootPersonId),
        gt(leadershipClosure.depth, 0),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * Rebuild closure for an entire subtree after moving `rootPersonId`
 * under `newDirectLeaderPersonId`. Descendants keep internal edges.
 */
export async function rebuildClosureForSubtree(
  rootPersonId: string,
  newDirectLeaderPersonId: string | null,
  ministryId: string,
) {
  const db = getDb();
  const subtree = await db
    .select()
    .from(leadershipClosure)
    .where(eq(leadershipClosure.ancestorPersonId, rootPersonId));

  const descendantIds = subtree.map((r) => r.descendantPersonId);
  if (descendantIds.length === 0) {
    descendantIds.push(rootPersonId);
  }

  // Remove all ancestral links into the subtree (keep self and internal later rebuild)
  await db
    .delete(leadershipClosure)
    .where(inArray(leadershipClosure.descendantPersonId, descendantIds));

  // Internal edges within subtree from old self-relative depths under root
  // Re-insert self rows + internal ancestor relationships among subtree
  const internal: Array<{
    ancestorPersonId: string;
    descendantPersonId: string;
    depth: number;
    ministryId: string;
  }> = [];

  // Self for every node
  for (const id of descendantIds) {
    internal.push({
      ancestorPersonId: id,
      descendantPersonId: id,
      depth: 0,
      ministryId,
    });
  }

  // Direct tree edges from person_leadership among subtree
  const leads = await db
    .select()
    .from(personLeadership)
    .where(inArray(personLeadership.personId, descendantIds));

  // BFS from root to compute depths within subtree
  const children = new Map<string, string[]>();
  for (const l of leads) {
    if (l.directLeaderPersonId && descendantIds.includes(l.directLeaderPersonId)) {
      const list = children.get(l.directLeaderPersonId) ?? [];
      list.push(l.personId);
      children.set(l.directLeaderPersonId, list);
    }
  }

  // For each node as ancestor, walk its descendants in subtree
  function walkFrom(node: string) {
    const queue: Array<{ id: string; depth: number }> = [{ id: node, depth: 0 }];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const child of children.get(cur.id) ?? []) {
        internal.push({
          ancestorPersonId: node,
          descendantPersonId: child,
          depth: cur.depth + 1,
          ministryId,
        });
        queue.push({ id: child, depth: cur.depth + 1 });
      }
    }
  }
  for (const id of descendantIds) walkFrom(id);

  // External ancestors of new parent → all subtree nodes
  if (newDirectLeaderPersonId) {
    const parentAncestors = await db
      .select()
      .from(leadershipClosure)
      .where(eq(leadershipClosure.descendantPersonId, newDirectLeaderPersonId));

    // Need self of parent — may have been deleted if parent was somehow in set (shouldn't)
    const parentSelf = parentAncestors.length
      ? parentAncestors
      : [
          {
            ancestorPersonId: newDirectLeaderPersonId,
            descendantPersonId: newDirectLeaderPersonId,
            depth: 0,
            ministryId,
          },
        ];

    // Get depth of root under parent = 1 relative to parent self
    for (const pa of parentSelf) {
      for (const desc of descendantIds) {
        // depth of desc under root within subtree
        const underRoot = internal.find(
          (i) => i.ancestorPersonId === rootPersonId && i.descendantPersonId === desc,
        );
        const depthUnderRoot = underRoot?.depth ?? (desc === rootPersonId ? 0 : 0);
        internal.push({
          ancestorPersonId: pa.ancestorPersonId,
          descendantPersonId: desc,
          depth: pa.depth + 1 + depthUnderRoot,
          ministryId,
        });
      }
    }
  }

  // Dedupe by (ancestor, descendant) keeping max depth consistency — use Map
  const map = new Map<string, (typeof internal)[0]>();
  for (const row of internal) {
    const key = `${row.ancestorPersonId}:${row.descendantPersonId}`;
    const prev = map.get(key);
    if (!prev || row.depth < prev.depth) map.set(key, row);
  }
  const values = [...map.values()];
  if (values.length) {
    // Insert in chunks
    const chunk = 500;
    for (let i = 0; i < values.length; i += chunk) {
      await db.insert(leadershipClosure).values(values.slice(i, i + chunk));
    }
  }

  await writeAuditLog({
    actorUserId: null,
    action: "closure.rebuilt",
    entityType: "leadership_closure",
    entityId: rootPersonId,
    metadata: {
      rootPersonId,
      newDirectLeaderPersonId,
      nodes: descendantIds.length,
      edges: values.length,
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
  const [person] = await getDb()
    .select()
    .from(persons)
    .where(eq(persons.id, input.personId))
    .limit(1);
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

  const destMinistryId =
    input.destinationMinistryId ?? org?.ministryId ?? null;
  const destNetworkId = input.destinationNetworkId ?? org?.networkId ?? null;

  if (input.transferType === "network_change") {
    if (!input.destinationNetworkId) {
      blockers.push("Red destino requerida.");
    } else if (org?.networkId) {
      // Network change of person — cell join rules apply when cells move
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
      // Cross-ministry requires approval flow — preview still allowed
      warnings.push("Cross-ministry: requiere aprobación explícita.");
    }
  }

  if (
    input.transferType === "subtree_move" ||
    input.transferType === "direct_leader_change"
  ) {
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
        // When moving, if already direct child, capacity ok; else check
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
      // Collect member person ids
      const db = getDb();
      for (const cell of openCells) {
        const mems = await db
          .select({ personId: cellMemberships.personId })
          .from(cellMemberships)
          .where(
            and(eq(cellMemberships.cellId, cell.id), eq(cellMemberships.status, "active")),
          );
        for (const m of mems) {
          if (!resolvedMembers.has(m.personId) && m.personId !== input.personId) {
            blockers.push(`Miembro sin resolución: ${m.personId}`);
          }
        }
      }
      const directs = await db
        .select({ personId: personLeadership.personId })
        .from(personLeadership)
        .where(
          and(
            eq(personLeadership.directLeaderPersonId, input.personId),
            eq(personLeadership.status, "active"),
          ),
        );
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
    // Allow draft even with blockers so plan can be refined — but submit blocks
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

  const crossMinistry =
    preview.sourceMinistryId &&
    preview.destinationMinistryId &&
    preview.sourceMinistryId !== preview.destinationMinistryId;

  const status =
    input.submit && crossMinistry && !isSuperadmin(actor)
      ? "pending"
      : input.submit
        ? crossMinistry && isSuperadmin(actor)
          ? "approved"
          : "pending"
        : "draft";

  // Same-ministry operational transfers can be auto-approved for LG/superadmin
  let finalStatus = status;
  if (
    input.submit &&
    !crossMinistry &&
    (isSuperadmin(actor) || isLeaderGeneral(actor))
  ) {
    finalStatus = "approved";
  }

  const db = getDb();
  const [row] = await db
    .insert(pastoralTransferRequests)
    .values({
      personId: input.personId,
      transferType: input.transferType,
      structureMode: input.structureMode ?? "not_applicable",
      status: finalStatus as never,
      requestedByUserId: actorUserId,
      sourceMinistryId: preview.sourceMinistryId,
      sourceNetworkId: preview.sourceNetworkId,
      destinationMinistryId: preview.destinationMinistryId,
      destinationNetworkId: preview.destinationNetworkId,
      proposedDirectLeaderPersonId: input.proposedDirectLeaderPersonId ?? null,
      targetCellId: input.targetCellId ?? null,
      reason: input.reason,
      plan: {
        preview,
        memberResolutions: input.memberResolutions,
        directLeaderResolutions: input.directLeaderResolutions,
      },
      approvedByUserId: finalStatus === "approved" ? actorUserId : null,
      approvedAt: finalStatus === "approved" ? new Date() : null,
      metadata: { crossMinistry: Boolean(crossMinistry) },
    })
    .returning();

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
  const db = getDb();

  const [row] = await db
    .select()
    .from(pastoralTransferRequests)
    .where(eq(pastoralTransferRequests.id, requestId))
    .for("update")
    .limit(1);
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

  const [updated] = await db
    .update(pastoralTransferRequests)
    .set({
      status: "approved",
      approvedByUserId: actorUserId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pastoralTransferRequests.id, requestId))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "transfer.approved",
    entityType: "pastoral_transfer_requests",
    entityId: updated.id,
    metadata: { personId: updated.personId },
  });
  return updated;
}

export async function rejectTransfer(
  actorUserId: string,
  requestId: string,
  reason: string,
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "transfers.approve", { type: "person" });
  const db = getDb();
  const [row] = await db
    .select()
    .from(pastoralTransferRequests)
    .where(eq(pastoralTransferRequests.id, requestId))
    .for("update")
    .limit(1);
  if (!row) throw new DomainError(DomainErrorCode.TRANSFER_NOT_FOUND, "Solicitud no encontrada.");
  if (row.status === "executed") {
    throw new DomainError(DomainErrorCode.TRANSFER_ALREADY_EXECUTED, "Ya ejecutada.");
  }
  const [updated] = await db
    .update(pastoralTransferRequests)
    .set({
      status: "rejected",
      rejectedByUserId: actorUserId,
      rejectedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(pastoralTransferRequests.id, requestId))
    .returning();
  await writeAuditLog({
    actorUserId,
    action: "transfer.rejected",
    entityType: "pastoral_transfer_requests",
    entityId: updated.id,
    metadata: { personId: updated.personId, reason },
  });
  return updated;
}

async function closeAndOpenOrgHistory(params: {
  personId: string;
  ministryId: string;
  networkId: string;
  actorUserId: string;
  reason: string;
}) {
  const db = getDb();
  const now = new Date();
  await db
    .update(personOrganizationHistory)
    .set({ effectiveTo: now })
    .where(
      and(
        eq(personOrganizationHistory.personId, params.personId),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    );
  await db.insert(personOrganizationHistory).values({
    personId: params.personId,
    ministryId: params.ministryId,
    networkId: params.networkId,
    effectiveFrom: now,
    changeReason: params.reason,
    createdByUserId: params.actorUserId,
  });
}

async function transferMembership(params: {
  personId: string;
  targetCellId: string;
  actorUserId: string;
  reason: string;
}) {
  const db = getDb();
  const [target] = await db
    .select()
    .from(cells)
    .where(eq(cells.id, params.targetCellId))
    .limit(1);
  if (!target) throw new DomainError(DomainErrorCode.CELL_NOT_FOUND, "Célula destino no encontrada.");

  const org = await currentOrg(params.personId);
  if (org?.networkId && target.networkId) {
    const pNet = await getNetworkCode(org.networkId);
    const cNet = await getNetworkCode(target.networkId);
    if (!canJoinCellNetwork(pNet, cNet)) {
      throw new DomainError(
        DomainErrorCode.TRANSFER_NETWORK_INCOMPATIBLE,
        "Red incompatible con célula destino.",
      );
    }
  }

  if (target.type === "twelve") {
    const lead = await getLeadership(params.personId);
    if (!lead || lead.status !== "active") {
      throw new DomainError(
        DomainErrorCode.TWELVE_MEMBER_NOT_ACTIVE_LEADER,
        "Célula de 12 solo admite líderes activos.",
      );
    }
  }

  const active = await db
    .select()
    .from(cellMemberships)
    .where(
      and(
        eq(cellMemberships.personId, params.personId),
        eq(cellMemberships.status, "active"),
      ),
    );
  for (const m of active) {
    if (m.cellId === params.targetCellId) continue;
    await db
      .update(cellMemberships)
      .set({
        status: "transferred",
        leftAt: new Date(),
        leaveReason: params.reason,
      })
      .where(eq(cellMemberships.id, m.id));
  }

  const role = target.type === "twelve" ? "twelve_team" : "member";
  const [existing] = await db
    .select()
    .from(cellMemberships)
    .where(
      and(
        eq(cellMemberships.cellId, params.targetCellId),
        eq(cellMemberships.personId, params.personId),
        eq(cellMemberships.role, role as never),
        eq(cellMemberships.status, "active"),
      ),
    )
    .limit(1);
  if (!existing) {
    await db.insert(cellMemberships).values({
      cellId: params.targetCellId,
      personId: params.personId,
      role: role as never,
      status: "active",
    });
  }
  await writeAuditLog({
    actorUserId: params.actorUserId,
    action: "cell.member.transferred",
    entityType: "cell_memberships",
    entityId: params.targetCellId,
    metadata: { personId: params.personId, reason: params.reason },
  });
}

/**
 * Execute approved transfer atomically.
 * Uses row lock + status guard for idempotency/concurrency.
 */
export async function executePastoralTransfer(actorUserId: string, requestId: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "transfers.execute", { type: "person" });
  const db = getDb();

  return db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(pastoralTransferRequests)
      .where(eq(pastoralTransferRequests.id, requestId))
      .for("update")
      .limit(1);

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

    const plan = (req.plan ?? {}) as {
      memberResolutions?: Array<{ personId: string; targetCellId: string }>;
      directLeaderResolutions?: Array<{
        personId: string;
        newDirectLeaderPersonId: string;
      }>;
      preview?: TransferPreview;
    };

    const leadership = await getLeadership(req.personId);
    const oldDirect = leadership?.directLeaderPersonId ?? null;

    // --- Org history (network / ministry) ---
    if (
      req.transferType === "network_change" ||
      req.transferType === "ministry_change" ||
      (req.destinationMinistryId &&
        req.destinationNetworkId &&
        (req.destinationMinistryId !== req.sourceMinistryId ||
          req.destinationNetworkId !== req.sourceNetworkId))
    ) {
      const ministryId = req.destinationMinistryId ?? req.sourceMinistryId;
      const networkId = req.destinationNetworkId ?? req.sourceNetworkId;
      if (!ministryId || !networkId) {
        throw new DomainError(
          DomainErrorCode.TRANSFER_INVALID_DESTINATION,
          "Destino organizacional incompleto.",
        );
      }
      const now = new Date();
      await tx
        .update(personOrganizationHistory)
        .set({ effectiveTo: now })
        .where(
          and(
            eq(personOrganizationHistory.personId, req.personId),
            isNull(personOrganizationHistory.effectiveTo),
          ),
        );
      await tx.insert(personOrganizationHistory).values({
        personId: req.personId,
        ministryId,
        networkId,
        effectiveFrom: now,
        changeReason: `transfer:${req.transferType}`,
        createdByUserId: actorUserId,
      });

      if (leadership) {
        await tx
          .update(personLeadership)
          .set({
            ministryId,
            networkId,
            updatedAt: new Date(),
          })
          .where(eq(personLeadership.personId, req.personId));
      }

      if (
        req.structureMode === "move_with_structure" &&
        leadership?.status === "active"
      ) {
        const openCells = await tx
          .select()
          .from(cells)
          .where(
            and(
              eq(cells.responsiblePersonId, req.personId),
              ne(cells.status, "closed"),
            ),
          );
        for (const cell of openCells) {
          await tx
            .update(cells)
            .set({ ministryId, networkId, updatedAt: new Date() })
            .where(eq(cells.id, cell.id));
        }
        // Update subtree org + leadership ministry when moving with structure cross-ministry
        if (req.destinationMinistryId && req.destinationMinistryId !== req.sourceMinistryId) {
          const descendants = await listSubtreePersonIds(req.personId);
          for (const descId of [req.personId, ...descendants]) {
            if (descId === req.personId) continue;
            await tx
              .update(personOrganizationHistory)
              .set({ effectiveTo: now })
              .where(
                and(
                  eq(personOrganizationHistory.personId, descId),
                  isNull(personOrganizationHistory.effectiveTo),
                ),
              );
            await tx.insert(personOrganizationHistory).values({
              personId: descId,
              ministryId,
              networkId,
              effectiveFrom: now,
              changeReason: `transfer:subtree_with_structure`,
              createdByUserId: actorUserId,
            });
            await tx
              .update(personLeadership)
              .set({ ministryId, networkId, updatedAt: new Date() })
              .where(eq(personLeadership.personId, descId));
          }
        }
      }

      await writeAuditLog({
        actorUserId,
        action:
          req.transferType === "network_change"
            ? "organization.network_changed"
            : "organization.ministry_changed",
        entityType: "person_organization_history",
        entityId: req.personId,
        metadata: {
          fromMinistry: req.sourceMinistryId,
          toMinistry: ministryId,
          fromNetwork: req.sourceNetworkId,
          toNetwork: networkId,
        },
      });
    }

    // --- Direct leader / subtree move ---
    if (
      (req.transferType === "direct_leader_change" ||
        req.transferType === "subtree_move" ||
        req.proposedDirectLeaderPersonId) &&
      req.proposedDirectLeaderPersonId
    ) {
      const newParent = req.proposedDirectLeaderPersonId;
      if (await isDescendantOf(req.personId, newParent)) {
        throw new DomainError(
          DomainErrorCode.LEADER_SUBTREE_CYCLE,
          "Ciclo de liderazgo detectado.",
        );
      }
      const parentLead = await getLeadership(newParent);
      if (!parentLead || parentLead.status !== "active") {
        throw new DomainError(
          DomainErrorCode.DIRECT_LEADER_INVALID,
          "Nuevo líder directo inválido.",
        );
      }
      const cap = await countDirectActive(newParent);
      if (oldDirect !== newParent && cap >= MAX_DIRECT_LEADERS) {
        throw new DomainError(
          DomainErrorCode.LEADER_PARENT_CAPACITY_REACHED,
          "Capacidad de 12 líderes directos alcanzada.",
        );
      }

      await tx
        .update(personLeadership)
        .set({
          directLeaderPersonId: newParent,
          updatedAt: new Date(),
        })
        .where(eq(personLeadership.personId, req.personId));

      await tx.insert(leadershipRelationshipHistory).values({
        personId: req.personId,
        oldDirectLeaderPersonId: oldDirect,
        newDirectLeaderPersonId: newParent,
        ministryId: req.destinationMinistryId ?? req.sourceMinistryId,
        reason: req.reason,
        transferRequestId: req.id,
        actorUserId,
      });

      await writeAuditLog({
        actorUserId,
        action:
          req.transferType === "subtree_move"
            ? "leader.subtree_moved"
            : "leader.direct_leader_changed",
        entityType: "person_leadership",
        entityId: req.personId,
        metadata: { oldDirect, newParent },
      });
    }

    // --- Cell membership transfer ---
    if (req.transferType === "cell_membership_transfer" && req.targetCellId) {
      // execute outside nested helper using tx would be cleaner — call via sequential ops
      const targetCellId = req.targetCellId;
      const [target] = await tx
        .select()
        .from(cells)
        .where(eq(cells.id, targetCellId))
        .limit(1);
      if (!target) throw new DomainError(DomainErrorCode.CELL_NOT_FOUND, "Célula no encontrada.");
      if (target.type === "twelve") {
        const lead = await getLeadership(req.personId);
        if (!lead || lead.status !== "active") {
          throw new DomainError(
            DomainErrorCode.TWELVE_MEMBER_NOT_ACTIVE_LEADER,
            "Célula de 12 solo líderes activos.",
          );
        }
      }
      const active = await tx
        .select()
        .from(cellMemberships)
        .where(
          and(
            eq(cellMemberships.personId, req.personId),
            eq(cellMemberships.status, "active"),
          ),
        );
      for (const m of active) {
        if (m.cellId === targetCellId) continue;
        await tx
          .update(cellMemberships)
          .set({
            status: "transferred",
            leftAt: new Date(),
            leaveReason: req.reason,
          })
          .where(eq(cellMemberships.id, m.id));
      }
      const role = target.type === "twelve" ? "twelve_team" : "member";
      await tx.insert(cellMemberships).values({
        cellId: targetCellId,
        personId: req.personId,
        role: role as never,
        status: "active",
      });
    }

    // --- Leader deactivation with plan ---
    if (req.transferType === "leader_deactivation") {
      for (const res of plan.memberResolutions ?? []) {
        // Resolve via membership transfer pattern inside tx
        const [target] = await tx
          .select()
          .from(cells)
          .where(eq(cells.id, res.targetCellId))
          .limit(1);
        if (!target) {
          throw new DomainError(DomainErrorCode.REASSIGNMENT_WOULD_ORPHAN_PERSON, "Célula destino inválida.");
        }
        // Cap: if assigning responsibility — not done here; only membership
        const active = await tx
          .select()
          .from(cellMemberships)
          .where(
            and(
              eq(cellMemberships.personId, res.personId),
              eq(cellMemberships.status, "active"),
            ),
          );
        for (const m of active) {
          await tx
            .update(cellMemberships)
            .set({
              status: "transferred",
              leftAt: new Date(),
              leaveReason: req.reason,
            })
            .where(eq(cellMemberships.id, m.id));
        }
        const role = target.type === "twelve" ? "twelve_team" : "member";
        if (target.type === "twelve") {
          const lead = await getLeadership(res.personId);
          if (!lead || lead.status !== "active") {
            throw new DomainError(
              DomainErrorCode.TWELVE_MEMBER_NOT_ACTIVE_LEADER,
              "No se puede enviar ordinario a célula de 12.",
            );
          }
        }
        await tx.insert(cellMemberships).values({
          cellId: res.targetCellId,
          personId: res.personId,
          role: role as never,
          status: "active",
        });
      }

      for (const res of plan.directLeaderResolutions ?? []) {
        const old = (await getLeadership(res.personId))?.directLeaderPersonId ?? null;
        await tx
          .update(personLeadership)
          .set({
            directLeaderPersonId: res.newDirectLeaderPersonId,
            updatedAt: new Date(),
          })
          .where(eq(personLeadership.personId, res.personId));
        await tx.insert(leadershipRelationshipHistory).values({
          personId: res.personId,
          oldDirectLeaderPersonId: old,
          newDirectLeaderPersonId: res.newDirectLeaderPersonId,
          reason: "deactivation_plan",
          transferRequestId: req.id,
          actorUserId,
        });
      }

      // Close cells of deactivated leader (members already moved)
      const openCells = await tx
        .select()
        .from(cells)
        .where(
          and(eq(cells.responsiblePersonId, req.personId), ne(cells.status, "closed")),
        );
      for (const cell of openCells) {
        const [{ c }] = await tx
          .select({ c: count() })
          .from(cellMemberships)
          .where(
            and(eq(cellMemberships.cellId, cell.id), eq(cellMemberships.status, "active")),
          );
        if (Number(c) > 0) {
          throw new DomainError(
            DomainErrorCode.REASSIGNMENT_WOULD_ORPHAN_PERSON,
            `Célula ${cell.id} aún tiene miembros activos.`,
          );
        }
        await tx
          .update(cells)
          .set({ status: "closed", updatedAt: new Date() })
          .where(eq(cells.id, cell.id));
        await tx.insert(cellLeadershipHistory).values({
          cellId: cell.id,
          oldResponsiblePersonId: req.personId,
          newResponsiblePersonId: null,
          reason: "leader_deactivation",
          transferRequestId: req.id,
          actorUserId,
        });
      }

      await tx
        .update(personLeadership)
        .set({
          status: "inactive",
          deactivatedAt: new Date(),
          deactivatedByUserId: actorUserId,
          primaryCellId: null,
          updatedAt: new Date(),
        })
        .where(eq(personLeadership.personId, req.personId));

      await writeAuditLog({
        actorUserId,
        action: "leader.deactivated",
        entityType: "person_leadership",
        entityId: req.personId,
        metadata: { via: "deactivation_plan", transferRequestId: req.id },
      });
    }

    // Mark executed BEFORE closure rebuild outside? Keep inside for atomicity.
    // Closure rebuild uses getDb() — need to do within same connection.
    // For simplicity rebuild after status update using tx raw deletes/inserts for the person.

    if (
      req.transferType === "subtree_move" ||
      req.transferType === "direct_leader_change" ||
      (req.proposedDirectLeaderPersonId && leadership)
    ) {
      const newParent = req.proposedDirectLeaderPersonId ?? null;
      const ministryId =
        req.destinationMinistryId ?? leadership?.ministryId ?? req.sourceMinistryId!;
      // Inline subtree rebuild using tx
      const subtree = await tx
        .select()
        .from(leadershipClosure)
        .where(eq(leadershipClosure.ancestorPersonId, req.personId));
      const descendantIds = subtree.length
        ? subtree.map((r) => r.descendantPersonId)
        : [req.personId];
      await tx
        .delete(leadershipClosure)
        .where(inArray(leadershipClosure.descendantPersonId, descendantIds));

      const leads = await tx
        .select()
        .from(personLeadership)
        .where(inArray(personLeadership.personId, descendantIds));
      const children = new Map<string, string[]>();
      for (const l of leads) {
        if (l.directLeaderPersonId && descendantIds.includes(l.directLeaderPersonId)) {
          const list = children.get(l.directLeaderPersonId) ?? [];
          list.push(l.personId);
          children.set(l.directLeaderPersonId, list);
        }
      }
      const edges: Array<{
        ancestorPersonId: string;
        descendantPersonId: string;
        depth: number;
        ministryId: string;
      }> = [];
      for (const id of descendantIds) {
        edges.push({
          ancestorPersonId: id,
          descendantPersonId: id,
          depth: 0,
          ministryId,
        });
        const queue: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];
        while (queue.length) {
          const cur = queue.shift()!;
          for (const child of children.get(cur.id) ?? []) {
            edges.push({
              ancestorPersonId: id,
              descendantPersonId: child,
              depth: cur.depth + 1,
              ministryId,
            });
            queue.push({ id: child, depth: cur.depth + 1 });
          }
        }
      }
      if (newParent) {
        const parentAncestors = await tx
          .select()
          .from(leadershipClosure)
          .where(eq(leadershipClosure.descendantPersonId, newParent));
        const pas = parentAncestors.length
          ? parentAncestors
          : [
              {
                ancestorPersonId: newParent,
                descendantPersonId: newParent,
                depth: 0,
                ministryId,
              },
            ];
        for (const pa of pas) {
          for (const desc of descendantIds) {
            const underRoot = edges.find(
              (e) =>
                e.ancestorPersonId === req.personId && e.descendantPersonId === desc,
            );
            const depthUnderRoot =
              underRoot?.depth ?? (desc === req.personId ? 0 : 0);
            edges.push({
              ancestorPersonId: pa.ancestorPersonId,
              descendantPersonId: desc,
              depth: pa.depth + 1 + depthUnderRoot,
              ministryId,
            });
          }
        }
      }
      const map = new Map<string, (typeof edges)[0]>();
      for (const e of edges) {
        const key = `${e.ancestorPersonId}:${e.descendantPersonId}`;
        if (!map.has(key)) map.set(key, e);
      }
      const vals = [...map.values()];
      for (let i = 0; i < vals.length; i += 400) {
        await tx.insert(leadershipClosure).values(vals.slice(i, i + 400));
      }
      await writeAuditLog({
        actorUserId,
        action: "closure.rebuilt",
        entityType: "leadership_closure",
        entityId: req.personId,
        metadata: { nodes: descendantIds.length, edges: vals.length },
      });
    }

    // Update user ministry scopes if ministry changed — preserve auth identity
    if (
      req.destinationMinistryId &&
      req.sourceMinistryId &&
      req.destinationMinistryId !== req.sourceMinistryId
    ) {
      const [u] = await tx
        .select()
        .from(users)
        .where(eq(users.personId, req.personId))
        .limit(1);
      if (u) {
        const now = new Date();
        const activeAssigns = await tx
          .select()
          .from(userRoleAssignments)
          .where(
            and(
              eq(userRoleAssignments.userId, u.id),
              isNull(userRoleAssignments.endsAt),
              eq(userRoleAssignments.ministryId, req.sourceMinistryId),
            ),
          );
        for (const a of activeAssigns) {
          await tx
            .update(userRoleAssignments)
            .set({ endsAt: now })
            .where(eq(userRoleAssignments.id, a.id));
          await tx.insert(userRoleAssignments).values({
            userId: u.id,
            roleId: a.roleId,
            ministryId: req.destinationMinistryId,
            networkId: req.destinationNetworkId ?? a.networkId,
            createdByUserId: actorUserId,
          });
        }
        await writeAuditLog({
          actorUserId,
          action: "organization.ministry_changed",
          entityType: "users",
          entityId: u.id,
          metadata: {
            personId: req.personId,
            fromMinistry: req.sourceMinistryId,
            toMinistry: req.destinationMinistryId,
            scopesUpdated: activeAssigns.length,
            identityPreserved: true,
          },
        });
      }
    }

    const [executed] = await tx
      .update(pastoralTransferRequests)
      .set({
        status: "executed",
        executedByUserId: actorUserId,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pastoralTransferRequests.id, requestId))
      .returning();

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
  });
}

export async function listTransferRequests(
  actorUserId: string,
  filters: { status?: string } = {},
) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "transfers.read")) {
    throw new DomainError(DomainErrorCode.TRANSFER_INVALID_ACTOR, "Sin permiso.");
  }
  const db = getDb();
  const conditions = [];
  if (filters.status) {
    conditions.push(eq(pastoralTransferRequests.status, filters.status as never));
  }
  if (!isSuperadmin(actor) && actor.ministryIds.length) {
    conditions.push(
      or(
        inArray(pastoralTransferRequests.sourceMinistryId, actor.ministryIds),
        inArray(pastoralTransferRequests.destinationMinistryId, actor.ministryIds),
        eq(pastoralTransferRequests.requestedByUserId, actor.userId),
      )!,
    );
  }
  const rows = await db
    .select({
      request: pastoralTransferRequests,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(pastoralTransferRequests)
    .innerJoin(persons, eq(persons.id, pastoralTransferRequests.personId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(pastoralTransferRequests.createdAt))
    .limit(100);

  return rows.map((r) => ({
    ...r.request,
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
  const db = getDb();
  const members: Array<{
    personId: string;
    fullName: string;
    cellId: string;
    cellType: string;
  }> = [];
  for (const cell of openCells) {
    const mems = await db
      .select({
        personId: cellMemberships.personId,
        firstName: persons.firstName,
        lastName: persons.lastName,
      })
      .from(cellMemberships)
      .innerJoin(persons, eq(persons.id, cellMemberships.personId))
      .where(
        and(eq(cellMemberships.cellId, cell.id), eq(cellMemberships.status, "active")),
      );
    for (const m of mems) {
      if (m.personId === personId) continue;
      members.push({
        personId: m.personId,
        fullName: formatFullName(m.firstName, m.lastName),
        cellId: cell.id,
        cellType: cell.type,
      });
    }
  }
  const directs = await db
    .select({
      personId: personLeadership.personId,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(personLeadership)
    .innerJoin(persons, eq(persons.id, personLeadership.personId))
    .where(
      and(
        eq(personLeadership.directLeaderPersonId, personId),
        eq(personLeadership.status, "active"),
      ),
    );

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
      personId: d.personId,
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

// Helpers retained for unit-style reuse / future paths
void closeAndOpenOrgHistory;
void transferMembership;
