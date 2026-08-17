import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { DatabaseReader, MutationCtx } from "./_generated/server";
import { conflict, invalidArgument, notFound } from "./lib/errors";
import { now } from "./lib/time";

/**
 * Leadership (Fase 4 / G12) domain module. Mirrors
 * `src/modules/leadership/service.ts` (Drizzle/Postgres) at MVP scope —
 * credential provisioning (Clerk) and human-code allocation stay in the
 * Next.js layer; this module owns pastoral state + the closure table.
 */

const MAX_DIRECT_LEADERS = 12;

const leadershipStatus = v.union(
  v.literal("none"),
  v.literal("eligible"),
  v.literal("active"),
  v.literal("inactive"),
);

/** Matches the `personLeadership` table shape in `schema.ts`. */
export const personLeadershipDoc = v.object({
  _id: v.id("personLeadership"),
  _creationTime: v.number(),
  personId: v.id("persons"),
  status: leadershipStatus,
  ministryId: v.id("ministries"),
  networkId: v.id("networks"),
  directLeaderPersonId: v.optional(v.id("persons")),
  primaryCellId: v.optional(v.id("cells")),
  humanLeaderCode: v.optional(v.string()),
  isMinistryRoot: v.boolean(),
  eligibleAt: v.optional(v.number()),
  eligibleByUserId: v.optional(v.id("users")),
  activatedAt: v.optional(v.number()),
  activatedByUserId: v.optional(v.id("users")),
  deactivatedAt: v.optional(v.number()),
  deactivatedByUserId: v.optional(v.id("users")),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function getLeadership(db: DatabaseReader, personId: Id<"persons">) {
  return await db
    .query("personLeadership")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .unique();
}

async function countActiveDirectLeaders(db: DatabaseReader, leaderPersonId: Id<"persons">) {
  const rows = await db
    .query("personLeadership")
    .withIndex("by_directLeader", (q) => q.eq("directLeaderPersonId", leaderPersonId))
    .collect();
  return rows.filter((r) => r.status === "active").length;
}

/** `ancestorPersonId === descendantPersonId` counts as a (trivial) descendant. */
async function isDescendantInternal(
  db: DatabaseReader,
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

/**
 * Rebuilds the closure rows for a single person after activation:
 * delete this person's rows (as descendant), reinsert the depth-0 self
 * row, then copy every ancestor row of `directLeaderPersonId` with
 * depth+1 (or a single depth-1 edge when the leader has no ancestors yet).
 */
async function rebuildClosureForPerson(
  ctx: MutationCtx,
  personId: Id<"persons">,
  directLeaderPersonId: Id<"persons"> | undefined,
  ministryId: Id<"ministries">,
): Promise<void> {
  const existing = await ctx.db
    .query("leadershipClosure")
    .withIndex("by_descendant", (q) => q.eq("descendantPersonId", personId))
    .collect();
  for (const row of existing) {
    await ctx.db.delete("leadershipClosure", row._id);
  }

  await ctx.db.insert("leadershipClosure", {
    ancestorPersonId: personId,
    descendantPersonId: personId,
    depth: 0,
    ministryId,
  });

  if (!directLeaderPersonId) return;

  const ancestorRows = await ctx.db
    .query("leadershipClosure")
    .withIndex("by_descendant", (q) => q.eq("descendantPersonId", directLeaderPersonId))
    .collect();

  if (ancestorRows.length === 0) {
    await ctx.db.insert("leadershipClosure", {
      ancestorPersonId: directLeaderPersonId,
      descendantPersonId: personId,
      depth: 1,
      ministryId,
    });
    return;
  }

  for (const ancestor of ancestorRows) {
    await ctx.db.insert("leadershipClosure", {
      ancestorPersonId: ancestor.ancestorPersonId,
      descendantPersonId: personId,
      depth: ancestor.depth + 1,
      ministryId,
    });
  }
}

// ---------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------

/** Marks a person as "apta/ungido" — eligible to be activated as leader later. */
export const markEligible = mutation({
  args: {
    personId: v.id("persons"),
    ministryId: v.id("ministries"),
    networkId: v.id("networks"),
    directLeaderPersonId: v.optional(v.id("persons")),
    actorUserId: v.id("users"),
  },
  returns: personLeadershipDoc,
  handler: async (ctx, args) => {
    const person = await ctx.db.get("persons", args.personId);
    if (!person || person.deletedAt !== undefined) return notFound("Persona no encontrada.");

    const existing = await getLeadership(ctx.db, args.personId);
    if (existing?.status === "active") return conflict("La persona ya es líder activo.");

    const ts = now();
    if (existing) {
      await ctx.db.patch("personLeadership", existing._id, {
        status: "eligible",
        ministryId: args.ministryId,
        networkId: args.networkId,
        directLeaderPersonId: args.directLeaderPersonId,
        eligibleAt: ts,
        eligibleByUserId: args.actorUserId,
        updatedAt: ts,
      });
      return (await ctx.db.get("personLeadership", existing._id))!;
    }

    const id = await ctx.db.insert("personLeadership", {
      personId: args.personId,
      status: "eligible",
      ministryId: args.ministryId,
      networkId: args.networkId,
      directLeaderPersonId: args.directLeaderPersonId,
      isMinistryRoot: false,
      eligibleAt: ts,
      eligibleByUserId: args.actorUserId,
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("personLeadership", id))!;
  },
});

/**
 * Activates an eligible person as leader: validates direct-leader
 * capacity/cycles (unless a Ministry root), sets `primaryCellId`, then
 * rebuilds the closure-table rows for this person.
 */
export const activate = mutation({
  args: {
    personId: v.id("persons"),
    directLeaderPersonId: v.optional(v.id("persons")),
    primaryCellId: v.id("cells"),
    isMinistryRoot: v.optional(v.boolean()),
    humanLeaderCode: v.optional(v.string()),
    actorUserId: v.id("users"),
  },
  returns: personLeadershipDoc,
  handler: async (ctx, args) => {
    const leadership = await getLeadership(ctx.db, args.personId);
    if (!leadership) {
      return notFound("La persona necesita estar marcada como apta antes de activarse.");
    }
    if (leadership.status === "active") return conflict("La persona ya es líder activo.");
    if (leadership.status !== "eligible") {
      return conflict("La persona debe estar marcada como apta antes de activarse.");
    }

    const isRoot = args.isMinistryRoot ?? false;
    const directLeaderPersonId = isRoot
      ? undefined
      : args.directLeaderPersonId ?? leadership.directLeaderPersonId;

    if (!isRoot) {
      if (!directLeaderPersonId) {
        return invalidArgument("Se requiere líder directo salvo raíces ministeriales.");
      }

      const directLeader = await getLeadership(ctx.db, directLeaderPersonId);
      if (!directLeader || directLeader.status !== "active") {
        return conflict("El líder directo debe estar activo.");
      }
      if (directLeader.ministryId !== leadership.ministryId) {
        return conflict("El líder directo debe ser del mismo Ministerio.");
      }

      if (await isDescendantInternal(ctx.db, args.personId, directLeaderPersonId)) {
        return conflict("La relación crearía un ciclo en el árbol de liderazgo.");
      }

      const directCount = await countActiveDirectLeaders(ctx.db, directLeaderPersonId);
      if (directCount >= MAX_DIRECT_LEADERS) {
        return conflict("El líder directo ya tiene 12 líderes activos.");
      }
    }

    const cell = await ctx.db.get("cells", args.primaryCellId);
    if (!cell || cell.status !== "active") {
      return conflict("La célula principal debe existir y estar activa.");
    }

    const ts = now();
    await ctx.db.patch("personLeadership", leadership._id, {
      status: "active",
      directLeaderPersonId,
      primaryCellId: args.primaryCellId,
      humanLeaderCode: args.humanLeaderCode ?? leadership.humanLeaderCode,
      isMinistryRoot: isRoot,
      activatedAt: ts,
      activatedByUserId: args.actorUserId,
      updatedAt: ts,
    });

    await rebuildClosureForPerson(ctx, args.personId, directLeaderPersonId, leadership.ministryId);

    return (await ctx.db.get("personLeadership", leadership._id))!;
  },
});

/** Deactivates a leader. Blocked while they still have active direct leaders or open cells. */
export const deactivate = mutation({
  args: { personId: v.id("persons"), actorUserId: v.id("users") },
  returns: personLeadershipDoc,
  handler: async (ctx, args) => {
    const leadership = await getLeadership(ctx.db, args.personId);
    if (!leadership || leadership.status !== "active") {
      return notFound("Líder activo no encontrado.");
    }

    const directCount = await countActiveDirectLeaders(ctx.db, args.personId);
    const ownCells = (
      await ctx.db
        .query("cells")
        .withIndex("by_responsiblePersonId", (q) => q.eq("responsiblePersonId", args.personId))
        .collect()
    ).filter((c) => c.status !== "closed");

    if (directCount > 0 || ownCells.length > 0) {
      return conflict(
        "No se puede desactivar: hay células o líderes directos activos. Reasigne o cierre primero.",
      );
    }

    const ts = now();
    await ctx.db.patch("personLeadership", leadership._id, {
      status: "inactive",
      deactivatedAt: ts,
      deactivatedByUserId: args.actorUserId,
      updatedAt: ts,
    });

    return (await ctx.db.get("personLeadership", leadership._id))!;
  },
});

/**
 * Full closure-table rebuild for a Ministry — repair/migration tool.
 * Deletes all `leadershipClosure` rows for the Ministry and reinserts
 * self (depth 0) + ancestor rows by walking `directLeaderPersonId`
 * chains among currently-active leaders.
 */
export const rebuildClosureForMinistry = mutation({
  args: { ministryId: v.id("ministries") },
  returns: v.object({ leadersProcessed: v.number(), edgesInserted: v.number() }),
  handler: async (ctx, args) => {
    const existingClosureRows = await ctx.db
      .query("leadershipClosure")
      .withIndex("by_ministry", (q) => q.eq("ministryId", args.ministryId))
      .collect();
    for (const row of existingClosureRows) {
      await ctx.db.delete("leadershipClosure", row._id);
    }

    const leaders = (
      await ctx.db
        .query("personLeadership")
        .withIndex("by_ministry", (q) => q.eq("ministryId", args.ministryId))
        .collect()
    ).filter((l) => l.status === "active");
    const byPerson = new Map(leaders.map((l) => [l.personId, l]));

    let edgesInserted = 0;
    for (const leader of leaders) {
      await ctx.db.insert("leadershipClosure", {
        ancestorPersonId: leader.personId,
        descendantPersonId: leader.personId,
        depth: 0,
        ministryId: args.ministryId,
      });
      edgesInserted += 1;

      let current = leader.directLeaderPersonId;
      let depth = 1;
      const visited = new Set<Id<"persons">>([leader.personId]);
      while (current && byPerson.has(current) && !visited.has(current)) {
        visited.add(current);
        await ctx.db.insert("leadershipClosure", {
          ancestorPersonId: current,
          descendantPersonId: leader.personId,
          depth,
          ministryId: args.ministryId,
        });
        edgesInserted += 1;
        current = byPerson.get(current)!.directLeaderPersonId;
        depth += 1;
      }
    }

    return { leadersProcessed: leaders.length, edgesInserted };
  },
});

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

export const getByPerson = query({
  args: { personId: v.id("persons") },
  returns: v.union(personLeadershipDoc, v.null()),
  handler: async (ctx, args) => {
    return await getLeadership(ctx.db, args.personId);
  },
});

/** Batch lookup — used by dashboards computing leadership status for a set of persons. */
export const getManyByPersons = query({
  args: { personIds: v.array(v.id("persons")) },
  returns: v.array(personLeadershipDoc),
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.personIds.map((personId) => getLeadership(ctx.db, personId)));
    return rows.filter((r): r is NonNullable<typeof r> => r !== null);
  },
});

/** All `personLeadership` rows (any status) with this `directLeaderPersonId` — for human-code allocation. */
export const listChildrenAny = query({
  args: { directLeaderPersonId: v.id("persons") },
  returns: v.array(v.object({ personId: v.id("persons"), humanLeaderCode: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("personLeadership")
      .withIndex("by_directLeader", (q) => q.eq("directLeaderPersonId", args.directLeaderPersonId))
      .collect();
    return rows.map((r) => ({ personId: r.personId, humanLeaderCode: r.humanLeaderCode }));
  },
});

/** Whether a `humanLeaderCode` is already taken — for root/collision allocation. */
export const isHumanCodeTaken = query({
  args: { code: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("personLeadership")
      .withIndex("by_humanLeaderCode", (q) => q.eq("humanLeaderCode", args.code))
      .unique();
    return row !== null;
  },
});

/** Active direct-leader count for a person — used by `deactivateLeader` guard. */
export const countActiveDirectLeadersFor = query({
  args: { leaderPersonId: v.id("persons") },
  returns: v.number(),
  handler: async (ctx, args) => {
    return await countActiveDirectLeaders(ctx.db, args.leaderPersonId);
  },
});

export const listDirectLeaders = query({
  args: { leaderPersonId: v.id("persons") },
  returns: v.array(
    v.object({
      personId: v.id("persons"),
      humanLeaderCode: v.optional(v.string()),
      status: leadershipStatus,
      primaryCellId: v.optional(v.id("cells")),
      firstName: v.string(),
      lastName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("personLeadership")
      .withIndex("by_directLeader", (q) => q.eq("directLeaderPersonId", args.leaderPersonId))
      .collect();
    const active = rows.filter((r) => r.status === "active");

    const withPerson = await Promise.all(
      active.map(async (r) => {
        const person = await ctx.db.get("persons", r.personId);
        return {
          personId: r.personId,
          humanLeaderCode: r.humanLeaderCode,
          status: r.status,
          primaryCellId: r.primaryCellId,
          firstName: person?.firstName ?? "",
          lastName: person?.lastName ?? "",
        };
      }),
    );

    withPerson.sort((a, b) => (a.humanLeaderCode ?? "").localeCompare(b.humanLeaderCode ?? ""));
    return withPerson;
  },
});

/** All `personLeadership` rows with `status: "eligible"` and this `directLeaderPersonId` — pending-activation list for a leader's dashboard. */
export const listEligibleChildren = query({
  args: { directLeaderPersonId: v.id("persons") },
  returns: v.array(
    v.object({ personId: v.id("persons"), firstName: v.string(), lastName: v.string() }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("personLeadership")
      .withIndex("by_directLeader", (q) => q.eq("directLeaderPersonId", args.directLeaderPersonId))
      .collect();
    const eligible = rows.filter((r) => r.status === "eligible").slice(0, 20);

    return await Promise.all(
      eligible.map(async (r) => {
        const person = await ctx.db.get("persons", r.personId);
        return { personId: r.personId, firstName: person?.firstName ?? "", lastName: person?.lastName ?? "" };
      }),
    );
  },
});

/** Ancestor chain (any depth > 0) for a person, with leader display data — used for breadcrumbs. */
export const listAncestors = query({
  args: { personId: v.id("persons") },
  returns: v.array(
    v.object({
      personId: v.id("persons"),
      depth: v.number(),
      humanLeaderCode: v.optional(v.string()),
      firstName: v.string(),
      lastName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("leadershipClosure")
      .withIndex("by_descendant", (q) => q.eq("descendantPersonId", args.personId))
      .collect();

    const withDetails = await Promise.all(
      rows.map(async (r) => {
        const [person, leadership] = await Promise.all([
          ctx.db.get("persons", r.ancestorPersonId),
          getLeadership(ctx.db, r.ancestorPersonId),
        ]);
        return {
          personId: r.ancestorPersonId,
          depth: r.depth,
          humanLeaderCode: leadership?.humanLeaderCode,
          firstName: person?.firstName ?? "",
          lastName: person?.lastName ?? "",
        };
      }),
    );

    return withDetails.sort((a, b) => b.depth - a.depth);
  },
});

export const isDescendant = query({
  args: { ancestorPersonId: v.id("persons"), descendantPersonId: v.id("persons") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return await isDescendantInternal(ctx.db, args.ancestorPersonId, args.descendantPersonId);
  },
});

/** All descendants (any depth > 0) of a person in the leadership tree. */
export const listDescendants = query({
  args: { ancestorPersonId: v.id("persons") },
  returns: v.array(v.object({ personId: v.id("persons"), depth: v.number() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("leadershipClosure")
      .withIndex("by_ancestor_depth", (q) => q.eq("ancestorPersonId", args.ancestorPersonId).gt("depth", 0))
      .collect();
    return rows.map((r) => ({ personId: r.descendantPersonId, depth: r.depth }));
  },
});

export const getDashboard = query({
  args: { personId: v.id("persons") },
  returns: v.union(
    v.object({
      leadership: personLeadershipDoc,
      directLeaderCount: v.number(),
      directLeaderCapacity: v.number(),
      descendantCount: v.number(),
      ownCellsCount: v.number(),
      eligiblePendingCount: v.number(),
      readyForTwelve: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const leadership = await getLeadership(ctx.db, args.personId);
    if (!leadership) return null;

    const directRows = await ctx.db
      .query("personLeadership")
      .withIndex("by_directLeader", (q) => q.eq("directLeaderPersonId", args.personId))
      .collect();
    const directLeaderCount = directRows.filter((l) => l.status === "active").length;
    const eligiblePendingCount = directRows.filter((l) => l.status === "eligible").length;

    const ownCellsCount = (
      await ctx.db
        .query("cells")
        .withIndex("by_responsiblePersonId", (q) => q.eq("responsiblePersonId", args.personId))
        .collect()
    ).filter((c) => c.status !== "closed").length;

    const descendantCount = (
      await ctx.db
        .query("leadershipClosure")
        .withIndex("by_ancestor_depth", (q) => q.eq("ancestorPersonId", args.personId).gt("depth", 0))
        .collect()
    ).length;

    return {
      leadership,
      directLeaderCount,
      directLeaderCapacity: MAX_DIRECT_LEADERS,
      descendantCount,
      ownCellsCount,
      eligiblePendingCount,
      readyForTwelve: directLeaderCount >= MAX_DIRECT_LEADERS,
    };
  },
});
