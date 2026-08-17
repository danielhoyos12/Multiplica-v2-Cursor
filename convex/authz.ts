import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { notFound } from "./lib/errors";
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
 * Loads the full authorization context for a user: active role codes,
 * the union of permissions granted by those roles, and the Ministry/Red
 * scopes implied by active assignments (plus Ministries where the user is
 * the registered `responsibleUserId`, i.e. Líder General).
 */
export const loadContext = query({
  args: { userId: v.id("users") },
  returns: authContext,
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);

    const assignments = await ctx.db
      .query("userRoleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const activeAssignments = assignments.filter((a) => a.endsAt === undefined);

    const roleIds = [...new Set(activeAssignments.map((a) => a.roleId))];
    const roleDocs = await Promise.all(roleIds.map((roleId) => ctx.db.get("roles", roleId)));
    const roleCodes = [
      ...new Set(
        roleDocs
          .filter((role): role is NonNullable<typeof role> => role !== null)
          .map((role) => role.code),
      ),
    ];

    const permissionCodes = new Set<string>();
    for (const roleId of roleIds) {
      const rolePermissions = await ctx.db
        .query("rolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", roleId))
        .collect();
      for (const rp of rolePermissions) {
        const permission = await ctx.db.get("permissions", rp.permissionId);
        if (permission) permissionCodes.add(permission.code);
      }
    }

    const ministryIds = new Set<string>();
    for (const assignment of activeAssignments) {
      if (assignment.ministryId) ministryIds.add(assignment.ministryId);
    }
    const responsibleMinistries = await ctx.db
      .query("ministries")
      .withIndex("by_responsibleUserId", (q) => q.eq("responsibleUserId", args.userId))
      .collect();
    for (const ministry of responsibleMinistries) {
      ministryIds.add(ministry._id);
    }

    const networkIds = new Set<string>();
    for (const assignment of activeAssignments) {
      if (assignment.networkId) networkIds.add(assignment.networkId);
    }

    return {
      userId: args.userId,
      personId: user?.personId ?? null,
      roleCodes,
      permissionCodes: [...permissionCodes],
      ministryIds: [...ministryIds],
      networkIds: [...networkIds],
    };
  },
});

/**
 * Creates a new active `userRoleAssignments` row. Does not end prior
 * assignments of the same role — callers that need "replace" semantics
 * (e.g. reassigning Líder General) should end the previous row first.
 */
export const assignRole = mutation({
  args: {
    userId: v.id("users"),
    roleCode: v.string(),
    ministryId: v.optional(v.id("ministries")),
    networkId: v.optional(v.id("networks")),
    createdByUserId: v.optional(v.id("users")),
  },
  returns: v.id("userRoleAssignments"),
  handler: async (ctx, args) => {
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
      createdByUserId: args.createdByUserId,
      createdAt: now(),
    });
  },
});

/**
 * Assigns the `superadmin` role to `userId` if that role has been seeded
 * (see `seed.ts`) and the user does not already hold an active assignment
 * of it. No-op (returns `null`) when the role catalog isn't seeded yet, so
 * bootstrap scripts can call this unconditionally.
 */
export const seedSuperadminRole = mutation({
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