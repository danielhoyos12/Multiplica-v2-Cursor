/**
 * Production / fixture safety guard.
 * Verify and fixture scripts must refuse production DB URLs.
 */
export function assertNotProductionTarget(opts?: {
  databaseUrl?: string | null;
  appEnv?: string | null;
}): void {
  const appEnv = (opts?.appEnv ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? "")
    .toLowerCase();
  const url = (opts?.databaseUrl ?? process.env.DATABASE_URL ?? "").toLowerCase();

  if (appEnv === "production") {
    throw new Error(
      "Refusing verify/fixture script against APP_ENV=production. Use staging/dev only.",
    );
  }

  const productionHints = [
    "prod",
    "production",
    // Explicit project allowlist can be added later
  ];
  // Soft check: URL containing '-prod' or '.prod.' as host fragment
  if (
    url.includes("-prod.") ||
    url.includes(".prod.") ||
    url.includes("production")
  ) {
    throw new Error(
      "Refusing script: DATABASE_URL looks like production. Override only with explicit staging.",
    );
  }

  void productionHints;
}

export function redactDatabaseUrl(url: string | null | undefined): string {
  if (!url) return "(none)";
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(redacted)";
  }
}
