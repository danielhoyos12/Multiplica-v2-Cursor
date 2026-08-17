import type { Id } from "../../../convex/_generated/dataModel";
import { api, getConvexHttpClient } from "@/server/convex";

import type { AuthContext } from "./policy";

/**
 * Loads authorization context for a signed-in app user from Convex.
 * Ministry scope = active role assignments with ministryId OR
 * ministries.responsibleUserId (see `convex/authz.ts` `loadContext`).
 */
export async function loadAuthContext(userId: string): Promise<AuthContext> {
  const client = getConvexHttpClient();
  const context = await client.query(api.authz.loadContext, {
    userId: userId as Id<"users">,
  });

  return {
    userId: context.userId,
    personId: context.personId,
    roleCodes: context.roleCodes,
    permissionCodes: context.permissionCodes,
    ministryIds: context.ministryIds,
    networkIds: context.networkIds,
  };
}
