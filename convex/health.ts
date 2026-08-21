import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireActiveAppUser } from "./lib/identity";

/**
 * Public liveness query — used by `/api/ready`. No auth.
 * Intentionally public: returns a constant, no user data.
 */
export const ping = query({
  args: {},
  returns: v.object({
    ok: v.literal(true),
    message: v.string(),
  }),
  handler: async () => {
    return {
      ok: true as const,
      message: "convex-ok",
    };
  },
});

export const recordCheck = mutation({
  args: { label: v.string() },
  returns: v.id("healthChecks"),
  handler: async (ctx, args) => {
    await requireActiveAppUser(ctx);
    return await ctx.db.insert("healthChecks", {
      label: args.label.trim() || "ok",
      createdAt: Date.now(),
    });
  },
});

export const listRecent = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("healthChecks"),
      _creationTime: v.number(),
      label: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireActiveAppUser(ctx);
    return await ctx.db
      .query("healthChecks")
      .withIndex("by_createdAt")
      .order("desc")
      .take(10);
  },
});
