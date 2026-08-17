import type { Id } from "../../../convex/_generated/dataModel";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

import type { AuthContext } from "./policy";

/**
 * Loads authorization context for a signed-in app user from Convex.
 * The Convex query verifies the Clerk JWT; `userId` is the target resource
 * (self or `users.read`), never a spoofable actor identity.
 */
export async function loadAuthContext(userId: string): Promise<AuthContext> {
  const client = await getAuthenticatedConvexClient();
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
