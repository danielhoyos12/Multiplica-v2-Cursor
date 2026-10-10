import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { requireActiveAppUser } from "./lib/identity";
import { now } from "./lib/time";

/**
 * Append-only audit trail writer. Actor is always the authenticated identity.
 * Client-supplied `actorUserId` is ignored (removed) to prevent impersonation.
 */
export const write = mutation({
  args: {
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
    const actor = await requireActiveAppUser(ctx);
    return await ctx.db.insert("auditLogs", {
      actorUserId: actor._id,
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
