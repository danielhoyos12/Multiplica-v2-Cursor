import { auth, currentUser } from "@clerk/nextjs/server";

import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasConvexPublicConfig } from "@/lib/env";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

export type SessionUser = {
  /** Convex `users` document id (`_id`), as a string. */
  id: string;
  /** Clerk `user_…` id — stored as Convex `users.authSubject`. */
  clerkUserId: string;
  email: string | undefined;
};

/**
 * Resolves the MULTIPLICA app user for the current Clerk session.
 * Does NOT create users. Unknown Clerk identities return null so the UI
 * can show “cuenta no habilitada”.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;

  if (!hasConvexPublicConfig()) {
    return null;
  }

  try {
    const client = await getAuthenticatedConvexClient();
    const me = await client.query(api.users.getMe, {});
    if (me) {
      return { id: me._id, clerkUserId: userId, email: me.email || email };
    }

    const linked = await client.mutation(api.users.linkProvisionedIdentity, {});
    if (linked) {
      return { id: linked._id, clerkUserId: userId, email: linked.email || email };
    }
  } catch {
    return null;
  }

  return null;
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new DomainError(
      DomainErrorCode.UNAUTHENTICATED,
      "Debes iniciar sesión para continuar.",
    );
  }
  return user;
}
