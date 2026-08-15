/**
 * Safe internal path for post-login redirects (open-redirect defense).
 */
export function safeInternalPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  if (trimmed.includes("@")) return fallback;
  // Disallow protocol-relative and encoded tricks
  try {
    const decoded = decodeURIComponent(trimmed);
    if (decoded.startsWith("//") || decoded.includes("://")) return fallback;
  } catch {
    return fallback;
  }
  return trimmed;
}

/** Routes allowed while must_change_password is true */
export function isPasswordChangeAllowedPath(pathname: string): boolean {
  return (
    pathname === "/cuenta/cambiar-password" ||
    pathname.startsWith("/cuenta/cambiar-password/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname === "/api/health" ||
    pathname === "/api/ready"
  );
}
