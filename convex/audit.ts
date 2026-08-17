import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { now } from "./lib/time";

/**
 * Append-only audit trail writer. Mirrors the shape previously written via
 * Drizzle `auditLogs` (see `src/modules/audit/logger.ts`). No read/query is
 * exposed here yet — add one when an audit viewer module needs it.
 */
export const write = mutation({
  args: {
    actorUserId: v.optional(v.union(v.id("users"), v.null())),
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.union(v.string(), v.null())),
    beforeData: v.optional(v.any()),
    afterData: v.optional(v.any()),
    reason: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
    requestId: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id("auditLogs"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId ?? undefined,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId ?? undefined,
      beforeData: args.beforeData ?? undefined,
      afterData: args.afterData ?? undefined,
      reason: args.reason ?? undefined,
      metadata: args.metadata ?? undefined,
      requestId: args.requestId ?? undefined,
      createdAt: now(),
    });
  },
});
