import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  MUST_CHANGE_PASSWORD_COOKIE,
  passwordGateCookieOptions,
} from "@/lib/password-change-gate";
import { safeInternalPath } from "@/lib/safe-redirect";
import { api, getConvexHttpClient } from "@/server/convex";

/**
 * Post-auth landing (e.g. password recovery). Clerk owns the OAuth/code exchange;
 * this route syncs the password-gate cookie from the DB profile.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = safeInternalPath(searchParams.get("next"), "/dashboard");

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let mustChange = false;
  try {
    const client = getConvexHttpClient();
    const profile = await client.query(api.users.getByAuthSubject, { authSubject: userId });
    mustChange = Boolean(profile?.mustChangePassword);
  } catch {
    mustChange = false;
  }

  const destination = mustChange ? "/cuenta/cambiar-password" : next;
  const response = NextResponse.redirect(new URL(destination, request.url));
  if (mustChange) {
    response.cookies.set(
      MUST_CHANGE_PASSWORD_COOKIE,
      "1",
      passwordGateCookieOptions(),
    );
  }
  return response;
}
