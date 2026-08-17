import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { conflict, notFound } from "./lib/errors";
import { now } from "./lib/time";
import { userDoc } from "./users";

/** Matches the `ministries` table shape in `schema.ts`. */
export const ministryDoc = v.object({
  _id: v.id("ministries"),
  _creationTime: v.number(),
  code: v.string(),
  name: v.string(),
  isActive: v.boolean(),
  sortOrder: v.number(),
  responsibleUserId: v.optional(v.id("users")),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** Matches the `networks` table shape in `schema.ts`. */
export const networkDoc = v.object({
  _id: v.id("networks"),
  _creationTime: v.number(),
  code: v.union(
    v.literal("hombres"),
    v.literal("mujeres"),
    v.literal("jovenes"),
    v.literal("ninos"),
  ),
  name: v.string(),
  isActive: v.boolean(),
  isConfigurable: v.boolean(),
  sortOrder: v.number(),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const userRoleAssignmentView = v.object({
  _id: v.id("userRoleAssignments"),
  userId: v.id("users"),
  userEmail: v.string(),
  roleCode: v.string(),
  ministryId: v.optional(v.id("ministries")),
  networkId: v.optional(v.id("networks")),
  startsAt: v.number(),
  endsAt: v.optional(v.number()),
  createdAt: v.number(),
});

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

/** All Ministerios Generales, ordered by their configured display order. */
export const listMinistries = query({
  args: {},
  returns: v.array(ministryDoc),
  handler: async (ctx) => {
    const rows = await ctx.db.query("ministries").collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  },
});

export const getMinistry = query({
  args: { ministryId: v.id("ministries") },
  returns: v.union(ministryDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("ministries", args.ministryId);
  },
});

/** All Redes (fixed catalog: hombres/mujeres/jovenes/ninos), ordered for display. */
export const listNetworks = query({
  args: {},
  returns: v.array(networkDoc),
  handler: async (ctx) => {
    const rows = await ctx.db.query("networks").collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const getNetwork = query({
  args: { networkId: v.id("networks") },
  returns: v.union(networkDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("networks", args.networkId);
  },
});

/** App users, ordered by email. Bounded — paginate via `listWithExtraArg`-style query if this grows unbounded. */
export const listUsers = query({
  args: {},
  returns: v.array(userDoc),
  handler: async (ctx) => {
    return await ctx.db.query("users").withIndex("by_email").order("asc").take(500);
  },
});

/** Active + historical role assignments, joined with role code and user email. */
export const listUserRoleAssignments = query({
  args: {},
  returns: v.array(userRoleAssignmentView),
  handler: async (ctx) => {
    const assignments = await ctx.db
      .query("userRoleAssignments")
      .order("desc")
      .take(500);

    const views = await Promise.all(
      assignments.map(async (assignment) => {
        const [user, role] = await Promise.all([
          ctx.db.get("users", assignment.userId),
          ctx.db.get("roles", assignment.roleId),
        ]);
        return {
          _id: assignment._id,
          userId: assignment.userId,
          userEmail: user?.email ?? "",
          roleCode: role?.code ?? "",
          ministryId: assignment.ministryId,
          networkId: assignment.networkId,
          startsAt: assignment.startsAt,
          endsAt: assignment.endsAt,
          createdAt: assignment.createdAt,
        };
      }),
    );

    return views.sort((a, b) => a.userEmail.localeCompare(b.userEmail));
  },
});

// ---------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------

export const createMinistry = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: ministryDoc,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ministries")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (existing) return conflict("Ya existe un ministerio con ese código.");

    const ts = now();
    const ministryId = await ctx.db.insert("ministries", {
      code: args.code,
      name: args.name,
      sortOrder: args.sortOrder ?? 0,
      isActive: args.isActive ?? true,
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("ministries", ministryId))!;
  },
});

export const updateMinistry = mutation({
  args: {
    ministryId: v.id("ministries"),
    code: v.optional(v.string()),
    name: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: ministryDoc,
  handler: async (ctx, args) => {
    const before = await ctx.db.get("ministries", args.ministryId);
    if (!before) return notFound("Ministerio no encontrado.");

    if (args.code !== undefined && args.code !== before.code) {
      const clash = await ctx.db
        .query("ministries")
        .withIndex("by_code", (q) => q.eq("code", args.code!))
        .unique();
      if (clash) return conflict("Ya existe un ministerio con ese código.");
    }

    const patch: Record<string, unknown> = { updatedAt: now() };
    if (args.code !== undefined) patch.code = args.code;
    if (args.name !== undefined) patch.name = args.name;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch("ministries", args.ministryId, patch);
    return (await ctx.db.get("ministries", args.ministryId))!;
  },
});

export const setMinistryActive = mutation({
  args: {
    ministryId: v.id("ministries"),
    isActive: v.boolean(),
  },
  returns: ministryDoc,
  handler: async (ctx, args) => {
    const before = await ctx.db.get("ministries", args.ministryId);
    if (!before) return notFound("Ministerio no encontrado.");

    await ctx.db.patch("ministries", args.ministryId, {
      isActive: args.isActive,
      updatedAt: now(),
    });
    return (await ctx.db.get("ministries", args.ministryId))!;
  },
});

/**
 * Assigns (or clears, when `responsibleUserId` is `null`) the Líder General
 * of a Ministerio: sets `ministries.responsibleUserId` and ends/creates the
 * matching `leader_general` `userRoleAssignments` row scoped to this
 * ministry, atomically.
 */
export const assignMinistryResponsible = mutation({
  args: {
    ministryId: v.id("ministries"),
    responsibleUserId: v.union(v.id("users"), v.null()),
    createdByUserId: v.optional(v.id("users")),
  },
  returns: ministryDoc,
  handler: async (ctx, args) => {
    const ministry = await ctx.db.get("ministries", args.ministryId);
    if (!ministry) return notFound("Ministerio no encontrado.");

    if (args.responsibleUserId) {
      const targetUser = await ctx.db.get("users", args.responsibleUserId);
      if (!targetUser || !targetUser.isActive) {
        return notFound("Usuario responsable no encontrado o inactivo.");
      }
    }

    const leaderGeneralRole = await ctx.db
      .query("roles")
      .withIndex("by_code", (q) => q.eq("code", "leader_general"))
      .unique();
    if (!leaderGeneralRole) return notFound("Rol leader_general no está seedado.");

    const ministryAssignments = await ctx.db
      .query("userRoleAssignments")
      .withIndex("by_ministry", (q) => q.eq("ministryId", args.ministryId))
      .collect();

    const ts = now();
    for (const assignment of ministryAssignments) {
      if (assignment.roleId === leaderGeneralRole._id && assignment.endsAt === undefined) {
        await ctx.db.patch("userRoleAssignments", assignment._id, { endsAt: ts });
      }
    }

    if (args.responsibleUserId) {
      await ctx.db.insert("userRoleAssignments", {
        userId: args.responsibleUserId,
        roleId: leaderGeneralRole._id,
        ministryId: args.ministryId,
        startsAt: ts,
        createdByUserId: args.createdByUserId,
        createdAt: ts,
      });
    }

    await ctx.db.patch("ministries", args.ministryId, {
      responsibleUserId: args.responsibleUserId ?? undefined,
      updatedAt: ts,
    });

    return (await ctx.db.get("ministries", args.ministryId))!;
  },
});
