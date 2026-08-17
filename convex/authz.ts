import { v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
import {
  isSuperadmin,
  loadAuthzForUser,
  requireActiveAppUser,
  requirePermission,
  requireSelfOrPermission,
} from "./lib/identity";
import { forbidden, notFound } from "./lib/errors";
import { now } from "./lib/time";

/** Mirrors `src/modules/authorization/policy.ts` `AuthContext` (ids as strings). */
export const authContext = v.object({
  userId: v.string(),
  personId: v.union(v.string(), v.null()),
  roleCodes: v.array(v.string()),
  permissionCodes: v.array(v.string()),
  ministryIds: v.array(v.string()),
  networkIds: v.array(v.string()),
});

/**
 * Loads authorization context. The caller must be the target user or hold
 * `users.read`. Actor identity always comes from the Clerk JWT.
 */
export const loadContext = query({
  args: { userId: v.id("users") },
  returns: authContext,
  handler: async (ctx, args) => {
    await requireSelfOrPermission(ctx, args.userId, "users.read");
    return await loadAuthzForUser(ctx, args.userId);
  },
});

/**
 * Assigns a role. `createdByUserId` is always the authenticated actor.
 * Superadmin role can only be granted by an existing superadmin.
 */
export const assignRole = mutation({
  args: {
    userId: v.id("users"),
    roleCode: v.string(),
    ministryId: v.optional(v.id("ministries")),
    networkId: v.optional(v.id("networks")),
  },
  returns: v.id("userRoleAssignments"),
  handler: async (ctx, args) => {
    const { actor, auth } = await requirePermission(ctx, "users.assign_roles");

    if (args.roleCode === "superadmin" && !isSuperadmin(auth)) {
      return forbidden("Solo un superadmin puede asignar el rol superadmin.");
    }

    const user = await ctx.db.get("users", args.userId);
    if (!user) return notFound("Usuario no encontrado.");

    const role = await ctx.db
      .query("roles")
      .withIndex("by_code", (q) => q.eq("code", args.roleCode))
      .unique();
    if (!role) return notFound(`Rol '${args.roleCode}' no está seedado.`);

    return await ctx.db.insert("userRoleAssignments", {
      userId: args.userId,
      roleId: role._id,
      ministryId: args.ministryId,
      networkId: args.networkId,
      startsAt: now(),
      createdByUserId: actor._id,
      createdAt: now(),
    });
  },
});

/**
 * Bootstrap-only: assign superadmin. Not callable from the Next.js client.
 * Run via `npx convex run authz:seedSuperadminRole '{"userId":"..."}'`.
 */
export const seedSuperadminRole = internalMutation({
  args: { userId: v.id("users") },
  returns: v.union(v.id("userRoleAssignments"), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return notFound("Usuario no encontrado.");

    const role = await ctx.db
      .query("roles")
      .withIndex("by_code", (q) => q.eq("code", "superadmin"))
      .unique();
    if (!role) return null;

    const existingAssignments = await ctx.db
      .query("userRoleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const alreadyAssigned = existingAssignments.find(
      (a) => a.roleId === role._id && a.endsAt === undefined,
    );
    if (alreadyAssigned) return alreadyAssigned._id;

    return await ctx.db.insert("userRoleAssignments", {
      userId: args.userId,
      roleId: role._id,
      startsAt: now(),
      createdAt: now(),
    });
  },
});

/** Current actor's authz context — derived from JWT, not from args. */
export const loadMyContext = query({
  args: {},
  returns: authContext,
  handler: async (ctx) => {
    const actor = await requireActiveAppUser(ctx);
    return await loadAuthzForUser(ctx, actor._id);
  },
});
