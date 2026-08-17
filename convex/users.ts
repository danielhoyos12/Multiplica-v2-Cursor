import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { notFound } from "./lib/errors";
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
 * Upserts the app `users` profile for an authenticated identity.
 * Match order: `authSubject` (stable Clerk/Convex identity subject) first,
 * then `email` (covers linking a pre-existing invited/legacy user row).
 * Idempotent — safe to call on every sign-in.
 */
export const ensureProfile = mutation({
  args: {
    authSubject: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
  },
  returns: userDoc,
  handler: async (ctx, args) => {
    const ts = now();

    const byAuthSubject = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", args.authSubject))
      .unique();

    if (byAuthSubject) {
      const patch: Record<string, unknown> = {};
      if (byAuthSubject.email !== args.email) patch.email = args.email;
      if (args.displayName !== undefined && byAuthSubject.displayName !== args.displayName) {
        patch.displayName = args.displayName;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = ts;
        await ctx.db.patch("users", byAuthSubject._id, patch);
        return (await ctx.db.get("users", byAuthSubject._id))!;
      }
      return byAuthSubject;
    }

    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (byEmail) {
      await ctx.db.patch("users", byEmail._id, {
        authSubject: args.authSubject,
        displayName: args.displayName ?? byEmail.displayName,
        updatedAt: ts,
      });
      return (await ctx.db.get("users", byEmail._id))!;
    }

    const userId = await ctx.db.insert("users", {
      authSubject: args.authSubject,
      email: args.email,
      displayName: args.displayName,
      isActive: true,
      mustChangePassword: false,
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("users", userId))!;
  },
});

export const getByAuthSubject = query({
  args: { authSubject: v.string() },
  returns: v.union(userDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", args.authSubject))
      .unique();
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  returns: v.union(userDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("users", args.userId);
  },
});

export const setMustChangePassword = mutation({
  args: {
    userId: v.id("users"),
    value: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
    const existing = await ctx.db.get("users", args.userId);
    if (!existing) return notFound("Usuario no encontrado.");

    await ctx.db.patch("users", args.userId, {
      isActive: args.isActive,
      updatedAt: now(),
    });
    return null;
  },
});
