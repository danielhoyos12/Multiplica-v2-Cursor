import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  findUserByAuthSubject,
  findUserByEmail,
  requireActiveAppUser,
  requireIdentity,
  requirePermission,
  requireSelfOrPermission,
} from "./lib/identity";
import { forbidden, notFound } from "./lib/errors";
import { now } from "./lib/time";

/** Matches the `users` table shape in `schema.ts`. */
export const userDoc = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  authSubject: v.string(),
  email: v.string(),
  username: v.optional(v.string()),
  displayName: v.optional(v.string()),
  personId: v.optional(v.id("persons")),
  isActive: v.boolean(),
  mustChangePassword: v.boolean(),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/**
 * Current app user for the Clerk JWT, or null when the identity is not
 * provisioned. Never inserts a `users` row.
 *
 * PUBLIC to authenticated Clerk sessions (returns only the caller's row).
 */
export const getMe = query({
  args: {},
  returns: v.union(userDoc, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await findUserByAuthSubject(ctx, identity.subject);
  },
});

/**
 * Links a Clerk identity to an already-provisioned MULTIPLICA user.
 * Match order: authSubject, then email of a pre-created row whose
 * `authSubject` is empty or already this subject.
 *
 * NEVER creates a new user. NEVER activates an inactive user. NEVER assigns roles.
 */
export const linkProvisionedIdentity = mutation({
  args: {},
  returns: v.union(userDoc, v.null()),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const ts = now();

    const bySubject = await findUserByAuthSubject(ctx, identity.subject);
    if (bySubject) return bySubject;

    const email =
      typeof identity.email === "string" && identity.email.trim()
        ? identity.email.trim().toLowerCase()
        : "";
    if (!email) return null;

    const byEmail = await findUserByEmail(ctx, email);
    if (!byEmail) return null;

    const existingSubject = byEmail.authSubject?.trim() ?? "";
    const alreadyLinkedToOther =
      existingSubject.length > 0 && existingSubject !== identity.subject;
    if (alreadyLinkedToOther) {
      return forbidden("Este correo ya está vinculado a otra identidad.");
    }

    await ctx.db.patch("users", byEmail._id, {
      authSubject: identity.subject,
      updatedAt: ts,
    });
    return (await ctx.db.get("users", byEmail._id))!;
  },
});

/**
 * @deprecated Use `getMe` + `linkProvisionedIdentity`. Kept as a no-insert
 * alias so older callers cannot auto-provision unknown Clerk identities.
 */
export const ensureProfile = mutation({
  args: {
    authSubject: v.optional(v.string()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  returns: v.union(userDoc, v.null()),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const existing = await findUserByAuthSubject(ctx, identity.subject);
    if (existing) {
      const ts = now();
      const email =
        typeof identity.email === "string" ? identity.email.trim() : "";
      const patch: Record<string, unknown> = {};
      if (email && existing.email !== email) patch.email = email;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = ts;
        await ctx.db.patch("users", existing._id, patch);
        return (await ctx.db.get("users", existing._id))!;
      }
      return existing;
    }
    return null;
  },
});

export const getByAuthSubject = query({
  args: { authSubject: v.string() },
  returns: v.union(userDoc, v.null()),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (identity.subject !== args.authSubject) {
      await requirePermission(ctx, "users.read");
    }
    return await findUserByAuthSubject(ctx, args.authSubject);
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  returns: v.union(userDoc, v.null()),
  handler: async (ctx, args) => {
    await requireSelfOrPermission(ctx, args.userId, "users.read");
    return await ctx.db.get("users", args.userId);
  },
});

export const getByUsername = query({
  args: { username: v.string() },
  returns: v.union(userDoc, v.null()),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "users.read");
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
  },
});

export const getByPersonId = query({
  args: { personId: v.id("persons") },
  returns: v.union(userDoc, v.null()),
  handler: async (ctx, args) => {
    await requireActiveAppUser(ctx);
    return await ctx.db
      .query("users")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .unique();
  },
});

/**
 * Creates (or updates) the app profile provisioned during leader activation.
 * Clerk `createUser` happens in Next; this mutation only persists the row.
 * Actor is derived from the Clerk JWT — never from client-supplied IDs.
 */
export const provisionLeaderUser = mutation({
  args: {
    personId: v.id("persons"),
    authSubject: v.string(),
    email: v.string(),
    username: v.string(),
    displayName: v.optional(v.string()),
  },
  returns: userDoc,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "leaders.activate");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .unique();
    const ts = now();

    if (existing) {
      await ctx.db.patch("users", existing._id, {
        username: existing.username ?? args.username,
        email: existing.email || args.email,
        displayName: args.displayName ?? existing.displayName,
        authSubject: args.authSubject || existing.authSubject,
        updatedAt: ts,
      });
      return (await ctx.db.get("users", existing._id))!;
    }

    const userId = await ctx.db.insert("users", {
      authSubject: args.authSubject,
      personId: args.personId,
      email: args.email,
      username: args.username,
      displayName: args.displayName,
      isActive: true,
      mustChangePassword: true,
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("users", userId))!;
  },
});

/** Rollback of a `users` row provisioned during a failed leader activation. */
export const remove = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "leaders.activate");
    const existing = await ctx.db.get("users", args.userId);
    if (!existing) return null;
    await ctx.db.delete("users", args.userId);
    return null;
  },
});

export const setMustChangePassword = mutation({
  args: {
    userId: v.id("users"),
    value: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireActiveAppUser(ctx);
    if (actor._id !== args.userId) {
      await requirePermission(ctx, "users.assign_roles");
    }
    const existing = await ctx.db.get("users", args.userId);
    if (!existing) return notFound("Usuario no encontrado.");

    await ctx.db.patch("users", args.userId, {
      mustChangePassword: args.value,
      updatedAt: now(),
    });
    return null;
  },
});

export const setActive = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "users.assign_roles");
    const existing = await ctx.db.get("users", args.userId);
    if (!existing) return notFound("Usuario no encontrado.");

    await ctx.db.patch("users", args.userId, {
      isActive: args.isActive,
      updatedAt: now(),
    });
    return null;
  },
});
