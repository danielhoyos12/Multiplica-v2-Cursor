import { auth, currentUser } from "@clerk/nextjs/server";

import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasConvexPublicConfig } from "@/lib/env";
import { ensureAppUserProfile } from "@/modules/organization";
import { api, getConvexHttpClient } from "@/server/convex";

export type SessionUser = {
  /** Convex `users` document id (`_id`), as a string. */
  id: string;
  /** Clerk `user_…` id — stored as Convex `users.authSubject`. */
  clerkUserId: string;
  email: string | undefined;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;

  if (!email) {
    return null;
  }

  if (!hasConvexPublicConfig()) {
    return null;
  }

  const client = getConvexHttpClient();
  const byAuthSubject = await client.query(api.users.getByAuthSubject, {
    authSubject: userId,
  });

  if (byAuthSubject) {
    return { id: byAuthSubject._id, clerkUserId: userId, email };
  }

  const profile = await ensureAppUserProfile({
    clerkUserId: userId,
    email,
    displayName: clerkUser?.fullName ?? null,
  });

  return { id: profile.id, clerkUserId: userId, email };
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
