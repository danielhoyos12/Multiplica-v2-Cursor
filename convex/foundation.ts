import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Phase 0 read stubs for foundation catalogs.
 * Live pastoral UI still uses Postgres until phase 1 cutover.
 */

export const listActiveNetworks = query({
  args: {},
  returns: v.array(
    v.object({
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
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("networks").withIndex("by_active", (q) => q.eq("isActive", true)).collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const listActiveMinistries = query({
  args: {},
  returns: v.array(
    v.object({
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
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("ministries")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const listActiveDistricts = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("districts"),
      _creationTime: v.number(),
      name: v.string(),
      metroArea: v.string(),
      isActive: v.boolean(),
      legacyPostgresId: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db
      .query("districts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});
