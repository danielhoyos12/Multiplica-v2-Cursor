import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireActiveAppUser, requirePermission } from "./lib/identity";
import { conflict, invalidArgument, notFound } from "./lib/errors";
import { now } from "./lib/time";

/**
 * Pastoral transfers (Fase 8) — simplified but functional request →
 * approve → execute engine. Mirrors `src/modules/transfers/service.ts`
 * (Drizzle/Postgres) at reduced scope: closure repair on execute uses a
 * full Ministry rebuild (see `leadership.ts` `rebuildClosureForMinistry`)
 * instead of a bespoke subtree BFS — correct, simpler, O(active leaders).
 */

const MAX_DIRECT_LEADERS = 12;

const transferType = v.union(
  v.literal("network_change"),
  v.literal("ministry_change"),
  v.literal("cell_membership_transfer"),
  v.literal("direct_leader_change"),
  v.literal("subtree_move"),
  v.literal("cell_reassignment"),
  v.literal("leader_deactivation"),
);

const structureMode = v.union(
  v.literal("move_with_structure"),
  v.literal("move_person_only_and_reassign_structure"),
  v.literal("not_applicable"),
);

const transferStatus = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("executed"),
  v.literal("cancelled"),
);

export const transferRequestDoc = v.object({
  _id: v.id("pastoralTransferRequests"),
  _creationTime: v.number(),
  personId: v.id("persons"),
  transferType,
  structureMode,
  status: transferStatus,
  requestedByUserId: v.id("users"),
  sourceMinistryId: v.optional(v.id("ministries")),
  sourceNetworkId: v.optional(v.id("networks")),
  destinationMinistryId: v.optional(v.id("ministries")),
  destinationNetworkId: v.optional(v.id("networks")),
  proposedDirectLeaderPersonId: v.optional(v.id("persons")),
  targetCellId: v.optional(v.id("cells")),
  reason: v.string(),
  plan: v.optional(v.any()),
  approvedByUserId: v.optional(v.id("users")),
  approvedAt: v.optional(v.number()),
  rejectedByUserId: v.optional(v.id("users")),
  rejectedAt: v.optional(v.number()),
  rejectionReason: v.optional(v.string()),
  executedByUserId: v.optional(v.id("users")),
  executedAt: v.optional(v.number()),
  cancelledByUserId: v.optional(v.id("users")),
  cancelledAt: v.optional(v.number()),
  metadata: v.optional(v.any()),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function getLeadershipInternal(db: QueryCtx["db"], personId: Id<"persons">) {
  return await db
    .query("personLeadership")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .unique();
}

async function currentOrgInternal(db: QueryCtx["db"], personId: Id<"persons">) {
  const rows = await db
    .query("personOrganizationHistory")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .collect();
  return rows.find((r) => r.effectiveTo === undefined) ?? null;
}

async function countActiveDirectLeaders(db: QueryCtx["db"], leaderPersonId: Id<"persons">) {
  const rows = await db
    .query("personLeadership")
    .withIndex("by_directLeader", (q) => q.eq("directLeaderPersonId", leaderPersonId))
    .collect();
  return rows.filter((r) => r.status === "active").length;
}

async function isDescendantInternal(
  db: QueryCtx["db"],
  ancestorPersonId: Id<"persons">,
  descendantPersonId: Id<"persons">,
): Promise<boolean> {
  if (ancestorPersonId === descendantPersonId) return true;
  const row = await db
    .query("leadershipClosure")
    .withIndex("by_ancestor_descendant", (q) =>
      q.eq("ancestorPersonId", ancestorPersonId).eq("descendantPersonId", descendantPersonId),
    )
    .unique();
  return Boolean(row && row.depth > 0);
}

/** Full Ministry closure rebuild — reused after any leadership tree edit. */
async function rebuildMinistryClosure(ctx: MutationCtx, ministryId: Id<"ministries">) {
  const existingClosureRows = await ctx.db
    .query("leadershipClosure")
    .withIndex("by_ministry", (q) => q.eq("ministryId", ministryId))
    .collect();
  for (const row of existingClosureRows) {
    await ctx.db.delete("leadershipClosure", row._id);
  }

  const leaders = (
    await ctx.db
      .query("personLeadership")
      .withIndex("by_ministry", (q) => q.eq("ministryId", ministryId))
      .collect()
  ).filter((l) => l.status === "active");
  const byPerson = new Map(leaders.map((l) => [l.personId, l]));

  for (const leader of leaders) {
    await ctx.db.insert("leadershipClosure", {
      ancestorPersonId: leader.personId,
      descendantPersonId: leader.personId,
      depth: 0,
      ministryId,
    });

    let current = leader.directLeaderPersonId;
    let depth = 1;
    const visited = new Set<Id<"persons">>([leader.personId]);
    while (current && byPerson.has(current) && !visited.has(current)) {
      visited.add(current);
      await ctx.db.insert("leadershipClosure", {
        ancestorPersonId: current,
        descendantPersonId: leader.personId,
        depth,
        ministryId,
      });
      current = byPerson.get(current)?.directLeaderPersonId;
      depth += 1;
    }
  }
}

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

export const getRequest = query({
  args: { requestId: v.id("pastoralTransferRequests") },
  returns: v.union(transferRequestDoc, v.null()),
  handler: async (ctx, args) => await ctx.db.get("pastoralTransferRequests", args.requestId),
});

export const listRequests = query({
  args: {
    status: v.optional(transferStatus),
    ministryIds: v.optional(v.array(v.id("ministries"))),
    requestedByUserId: v.optional(v.id("users")),
  },
  returns: v.array(
    v.object({ request: transferRequestDoc, firstName: v.string(), lastName: v.string() }),
  ),
  handler: async (ctx, args) => {
    await requireActiveAppUser(ctx);

    let rows: Doc<"pastoralTransferRequests">[];
    if (args.status) {
      rows = await ctx.db
        .query("pastoralTransferRequests")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      rows = await ctx.db.query("pastoralTransferRequests").collect();
    }
    if (args.ministryIds && args.ministryIds.length) {
      const set = new Set(args.ministryIds);
      rows = rows.filter(
        (r) =>
          (r.sourceMinistryId && set.has(r.sourceMinistryId)) ||
          (r.destinationMinistryId && set.has(r.destinationMinistryId)) ||
          r.requestedByUserId === args.requestedByUserId,
      );
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    const withNames = await Promise.all(
      rows.slice(0, 100).map(async (request) => {
        const person = await ctx.db.get("persons", request.personId);
        return { request, firstName: person?.firstName ?? "", lastName: person?.lastName ?? "" };
      }),
    );
    return withNames;
  },
});

export const getPersonSnapshot = query({
  args: { personId: v.id("persons") },
  returns: v.object({
    org: v.union(
      v.object({
        ministryId: v.optional(v.id("ministries")),
        networkId: v.optional(v.id("networks")),
      }),
      v.null(),
    ),
    leadership: v.union(
      v.object({
        status: v.union(v.literal("none"), v.literal("eligible"), v.literal("active"), v.literal("inactive")),
        ministryId: v.id("ministries"),
        networkId: v.id("networks"),
        directLeaderPersonId: v.optional(v.id("persons")),
      }),
      v.null(),
    ),
    openCells: v.array(v.object({ id: v.id("cells"), name: v.string(), type: v.union(v.literal("evangelistic"), v.literal("twelve")) })),
    descendantCount: v.number(),
    activeMembersInOwnCells: v.number(),
    activeDirectLeaderCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireActiveAppUser(ctx);

    const org = await currentOrgInternal(ctx.db, args.personId);
    const leadership = await getLeadershipInternal(ctx.db, args.personId);
    const openCells = (
      await ctx.db
        .query("cells")
        .withIndex("by_responsiblePersonId", (q) => q.eq("responsiblePersonId", args.personId))
        .collect()
    ).filter((c) => c.status !== "closed");
    let activeMembersInOwnCells = 0;
    for (const cell of openCells) {
      const members = await ctx.db
        .query("cellMemberships")
        .withIndex("by_cell_person", (q) => q.eq("cellId", cell._id))
        .collect();
      activeMembersInOwnCells += members.filter((m) => m.status === "active").length;
    }
    const descendants = await ctx.db
      .query("leadershipClosure")
      .withIndex("by_ancestor_depth", (q) => q.eq("ancestorPersonId", args.personId).gt("depth", 0))
      .collect();
    const activeDirectLeaderCount =
      leadership?.status === "active" ? await countActiveDirectLeaders(ctx.db, args.personId) : 0;

    return {
      org: org ? { ministryId: org.ministryId, networkId: org.networkId } : null,
      leadership: leadership
        ? {
            status: leadership.status,
            ministryId: leadership.ministryId,
            networkId: leadership.networkId,
            directLeaderPersonId: leadership.directLeaderPersonId,
          }
        : null,
      openCells: openCells.map((c) => ({ id: c._id, name: c.name, type: c.type })),
      descendantCount: descendants.length,
      activeMembersInOwnCells,
      activeDirectLeaderCount,
    };
  },
});

// ---------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------

export const createRequest = mutation({
  args: {
    personId: v.id("persons"),
    transferType,
    structureMode,
    requestedByUserId: v.id("users"),
    status: transferStatus,
    sourceMinistryId: v.optional(v.id("ministries")),
    sourceNetworkId: v.optional(v.id("networks")),
    destinationMinistryId: v.optional(v.id("ministries")),
    destinationNetworkId: v.optional(v.id("networks")),
    proposedDirectLeaderPersonId: v.optional(v.id("persons")),
    targetCellId: v.optional(v.id("cells")),
    reason: v.string(),
    plan: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  returns: transferRequestDoc,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "transfers.request");

    const ts = now();
    const id = await ctx.db.insert("pastoralTransferRequests", {
      personId: args.personId,
      transferType: args.transferType,
      structureMode: args.structureMode,
      status: args.status,
      requestedByUserId: args.requestedByUserId,
      sourceMinistryId: args.sourceMinistryId,
      sourceNetworkId: args.sourceNetworkId,
      destinationMinistryId: args.destinationMinistryId,
      destinationNetworkId: args.destinationNetworkId,
      proposedDirectLeaderPersonId: args.proposedDirectLeaderPersonId,
      targetCellId: args.targetCellId,
      reason: args.reason,
      plan: args.plan,
      approvedByUserId: args.status === "approved" ? args.requestedByUserId : undefined,
      approvedAt: args.status === "approved" ? ts : undefined,
      metadata: args.metadata,
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("pastoralTransferRequests", id))!;
  },
});

export const approve = mutation({
  args: { requestId: v.id("pastoralTransferRequests"), },
  returns: transferRequestDoc,
  handler: async (ctx, args) => {
    const { actor } = await requirePermission(ctx, "transfers.approve");

    const row = await ctx.db.get("pastoralTransferRequests", args.requestId);
    if (!row) return notFound("Solicitud no encontrada.");
    if (row.status === "executed") return conflict("Ya ejecutada.");
    if (row.status !== "pending" && row.status !== "draft") {
      return conflict(`Estado actual: ${row.status}`);
    }
    const ts = now();
    await ctx.db.patch("pastoralTransferRequests", args.requestId, {
      status: "approved",
      approvedByUserId: actor._id,
      approvedAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("pastoralTransferRequests", args.requestId))!;
  },
});

export const reject = mutation({
  args: {
    requestId: v.id("pastoralTransferRequests"), reason: v.string(),
  },
  returns: transferRequestDoc,
  handler: async (ctx, args) => {
    const { actor } = await requirePermission(ctx, "transfers.approve");

    const row = await ctx.db.get("pastoralTransferRequests", args.requestId);
    if (!row) return notFound("Solicitud no encontrada.");
    if (row.status === "executed") return conflict("Ya ejecutada.");
    const ts = now();
    await ctx.db.patch("pastoralTransferRequests", args.requestId, {
      status: "rejected",
      rejectedByUserId: actor._id,
      rejectedAt: ts,
      rejectionReason: args.reason,
      updatedAt: ts,
    });
    return (await ctx.db.get("pastoralTransferRequests", args.requestId))!;
  },
});

export const execute = mutation({
  args: { requestId: v.id("pastoralTransferRequests"), },
  returns: transferRequestDoc,
  handler: async (ctx, args) => {
    const { actor } = await requirePermission(ctx, "transfers.execute");

    const req = await ctx.db.get("pastoralTransferRequests", args.requestId);
    if (!req) return notFound("Solicitud no encontrada.");
    if (req.status === "executed") return conflict("Ya ejecutada.");
    if (req.status !== "approved") return conflict("La transferencia debe estar aprobada.");

    const plan = (req.plan ?? {}) as {
      memberResolutions?: Array<{ personId: Id<"persons">; targetCellId: Id<"cells"> }>;
      directLeaderResolutions?: Array<{
        personId: Id<"persons">;
        newDirectLeaderPersonId: Id<"persons">;
      }>;
    };

    const leadership = await getLeadershipInternal(ctx.db, req.personId);
    const oldDirect = leadership?.directLeaderPersonId ?? undefined;
    const ts = now();
    const affectedMinistries = new Set<Id<"ministries">>();
    if (req.sourceMinistryId) affectedMinistries.add(req.sourceMinistryId);
    if (req.destinationMinistryId) affectedMinistries.add(req.destinationMinistryId);
    if (leadership) affectedMinistries.add(leadership.ministryId);

    // --- Org history (network / ministry) ---
    const orgChanged =
      req.transferType === "network_change" ||
      req.transferType === "ministry_change" ||
      (req.destinationMinistryId &&
        req.destinationNetworkId &&
        (req.destinationMinistryId !== req.sourceMinistryId ||
          req.destinationNetworkId !== req.sourceNetworkId));

    if (orgChanged) {
      const ministryId = req.destinationMinistryId ?? req.sourceMinistryId;
      const networkId = req.destinationNetworkId ?? req.sourceNetworkId;
      if (!ministryId || !networkId) return invalidArgument("Destino organizacional incompleto.");

      const openHistory = await ctx.db
        .query("personOrganizationHistory")
        .withIndex("by_person", (q) => q.eq("personId", req.personId))
        .collect();
      for (const row of openHistory) {
        if (row.effectiveTo === undefined) {
          await ctx.db.patch("personOrganizationHistory", row._id, { effectiveTo: ts });
        }
      }
      await ctx.db.insert("personOrganizationHistory", {
        personId: req.personId,
        ministryId,
        networkId,
        effectiveFrom: ts,
        changeReason: `transfer:${req.transferType}`,
        createdByUserId: actor._id,
        createdAt: ts,
      });

      if (leadership) {
        await ctx.db.patch("personLeadership", leadership._id, {
          ministryId,
          networkId,
          updatedAt: ts,
        });
      }
      affectedMinistries.add(ministryId);
    }

    // --- Direct leader / subtree move ---
    if (req.proposedDirectLeaderPersonId) {
      const newParent = req.proposedDirectLeaderPersonId;
      if (await isDescendantInternal(ctx.db, req.personId, newParent)) {
        return conflict("Ciclo de liderazgo detectado.");
      }
      const parentLead = await getLeadershipInternal(ctx.db, newParent);
      if (!parentLead || parentLead.status !== "active") {
        return conflict("Nuevo líder directo inválido.");
      }
      const cap = await countActiveDirectLeaders(ctx.db, newParent);
      if (oldDirect !== newParent && cap >= MAX_DIRECT_LEADERS) {
        return conflict("Capacidad de 12 líderes directos alcanzada.");
      }
      if (leadership) {
        await ctx.db.patch("personLeadership", leadership._id, {
          directLeaderPersonId: newParent,
          updatedAt: ts,
        });
        affectedMinistries.add(leadership.ministryId);
      }
      await ctx.db.insert("leadershipRelationshipHistory", {
        personId: req.personId,
        oldDirectLeaderPersonId: oldDirect,
        newDirectLeaderPersonId: newParent,
        ministryId: req.destinationMinistryId ?? req.sourceMinistryId,
        reason: req.reason,
        transferRequestId: req._id,
        actorUserId: actor._id,
        changedAt: ts,
      });
      affectedMinistries.add(parentLead.ministryId);
    }

    // --- Cell membership transfer ---
    if (req.transferType === "cell_membership_transfer" && req.targetCellId) {
      const target = await ctx.db.get("cells", req.targetCellId);
      if (!target) return notFound("Célula no encontrada.");
      if (target.type === "twelve") {
        const lead = await getLeadershipInternal(ctx.db, req.personId);
        if (!lead || lead.status !== "active") {
          return conflict("Célula de 12 solo líderes activos.");
        }
      }
      const active = await ctx.db
        .query("cellMemberships")
        .withIndex("by_person_status", (q) => q.eq("personId", req.personId).eq("status", "active"))
        .collect();
      for (const m of active) {
        if (m.cellId === req.targetCellId) continue;
        await ctx.db.patch("cellMemberships", m._id, {
          status: "transferred",
          leftAt: ts,
          leaveReason: req.reason,
          updatedAt: ts,
        });
      }
      const role = target.type === "twelve" ? "twelve_team" : "member";
      await ctx.db.insert("cellMemberships", {
        cellId: req.targetCellId,
        personId: req.personId,
        role,
        status: "active",
        joinedAt: ts,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    // --- Leader deactivation (simplified plan resolution) ---
    if (req.transferType === "leader_deactivation") {
      for (const res of plan.memberResolutions ?? []) {
        const target = await ctx.db.get("cells", res.targetCellId);
        if (!target) return conflict("Célula destino inválida en el plan.");
        if (target.type === "twelve") {
          const lead = await getLeadershipInternal(ctx.db, res.personId);
          if (!lead || lead.status !== "active") {
            return conflict("No se puede enviar ordinario a célula de 12.");
          }
        }
        const active = await ctx.db
          .query("cellMemberships")
          .withIndex("by_person_status", (q) => q.eq("personId", res.personId).eq("status", "active"))
          .collect();
        for (const m of active) {
          await ctx.db.patch("cellMemberships", m._id, {
            status: "transferred",
            leftAt: ts,
            leaveReason: req.reason,
            updatedAt: ts,
          });
        }
        const role = target.type === "twelve" ? "twelve_team" : "member";
        await ctx.db.insert("cellMemberships", {
          cellId: res.targetCellId,
          personId: res.personId,
          role,
          status: "active",
          joinedAt: ts,
          createdAt: ts,
          updatedAt: ts,
        });
      }

      for (const res of plan.directLeaderResolutions ?? []) {
        const old = (await getLeadershipInternal(ctx.db, res.personId))?.directLeaderPersonId;
        await ctx.db.patch("personLeadership", (await getLeadershipInternal(ctx.db, res.personId))!._id, {
          directLeaderPersonId: res.newDirectLeaderPersonId,
          updatedAt: ts,
        });
        await ctx.db.insert("leadershipRelationshipHistory", {
          personId: res.personId,
          oldDirectLeaderPersonId: old,
          newDirectLeaderPersonId: res.newDirectLeaderPersonId,
          reason: "deactivation_plan",
          transferRequestId: req._id,
          actorUserId: actor._id,
          changedAt: ts,
        });
      }

      const openCells = (
        await ctx.db
          .query("cells")
          .withIndex("by_responsiblePersonId", (q) => q.eq("responsiblePersonId", req.personId))
          .collect()
      ).filter((c) => c.status !== "closed");
      for (const cell of openCells) {
        const members = await ctx.db
          .query("cellMemberships")
          .withIndex("by_cell_person", (q) => q.eq("cellId", cell._id))
          .collect();
        const activeCount = members.filter((m) => m.status === "active").length;
        if (activeCount > 0) {
          return conflict(`Célula ${cell._id} aún tiene miembros activos.`);
        }
        await ctx.db.patch("cells", cell._id, { status: "closed", updatedAt: ts });
        await ctx.db.insert("cellLeadershipHistory", {
          cellId: cell._id,
          oldResponsiblePersonId: req.personId,
          newResponsiblePersonId: undefined,
          reason: "leader_deactivation",
          transferRequestId: req._id,
          actorUserId: actor._id,
          changedAt: ts,
        });
      }

      if (leadership) {
        await ctx.db.patch("personLeadership", leadership._id, {
          status: "inactive",
          deactivatedAt: ts,
          deactivatedByUserId: actor._id,
          primaryCellId: undefined,
          updatedAt: ts,
        });
        affectedMinistries.add(leadership.ministryId);
      }
    }

    for (const ministryId of affectedMinistries) {
      await rebuildMinistryClosure(ctx, ministryId);
    }

    const ministryChanged =
      req.destinationMinistryId &&
      req.sourceMinistryId &&
      req.destinationMinistryId !== req.sourceMinistryId;
    if (ministryChanged) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_personId", (q) => q.eq("personId", req.personId))
        .unique();
      if (user) {
        const assigns = await ctx.db
          .query("userRoleAssignments")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();
        const active = assigns.filter(
          (a) => a.endsAt === undefined && a.ministryId === req.sourceMinistryId,
        );
        for (const a of active) {
          await ctx.db.patch("userRoleAssignments", a._id, { endsAt: ts });
          await ctx.db.insert("userRoleAssignments", {
            userId: user._id,
            roleId: a.roleId,
            ministryId: req.destinationMinistryId,
            networkId: req.destinationNetworkId ?? a.networkId,
            startsAt: ts,
            createdByUserId: actor._id,
            createdAt: ts,
          });
        }
      }
    }

    await ctx.db.patch("pastoralTransferRequests", args.requestId, {
      status: "executed",
      executedByUserId: actor._id,
      executedAt: ts,
      updatedAt: ts,
    });

    return (await ctx.db.get("pastoralTransferRequests", args.requestId))!;
  },
});
