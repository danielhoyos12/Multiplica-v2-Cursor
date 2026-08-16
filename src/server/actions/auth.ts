"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  MUST_CHANGE_PASSWORD_COOKIE,
  passwordGateCookieOptions,
} from "@/lib/password-change-gate";

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.set(MUST_CHANGE_PASSWORD_COOKIE, "", {
    ...passwordGateCookieOptions(0),
    maxAge: 0,
  });

  const { sessionId } = await auth();
  if (sessionId && process.env.CLERK_SECRET_KEY) {
    try {
      const client = await clerkClient();
      await client.sessions.revokeSession(sessionId);
    } catch {
      // best-effort; client cookie clear still happens via redirect to login
    }
  }

  redirect("/login");
}
