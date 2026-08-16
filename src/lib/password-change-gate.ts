/**
 * Password-change / recovery navigation gate helpers.
 * Source of truth: users.must_change_password (+ synced Auth user_metadata).
 */

export const MUST_CHANGE_PASSWORD_COOKIE = "multiplica_pcg";

export type AuthUserLike = {
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
};

/** True when Auth metadata marks forced password change (middleware-safe). */
export function authUserRequiresPasswordChange(user: AuthUserLike | null | undefined): boolean {
  if (!user) return false;
  return (
    user.user_metadata?.must_change_password === true ||
    user.app_metadata?.must_change_password === true
  );
}

export function cookieRequiresPasswordChange(
  cookieValue: string | undefined | null,
): boolean {
  return cookieValue === "1" || cookieValue === "true";
}

export function sessionRequiresPasswordChange(opts: {
  user?: AuthUserLike | null;
  cookieValue?: string | null;
}): boolean {
  return (
    authUserRequiresPasswordChange(opts.user) ||
    cookieRequiresPasswordChange(opts.cookieValue)
  );
}

export function passwordGateCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
