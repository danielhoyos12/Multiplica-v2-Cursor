import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { ensureAppUserProfile } from "@/modules/organization";

export type SessionUser = {
  /** App `users.id` (UUID). */
  id: string;
  /** Clerk `user_…` id. */
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

  if (!process.env.DATABASE_URL) {
    return null;
  }

  const db = getDb();
  const [byClerk] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);

  if (byClerk) {
    return { id: byClerk.id, clerkUserId: userId, email };
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
