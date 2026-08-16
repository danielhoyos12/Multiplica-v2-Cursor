import { NextResponse } from "next/server";

import {
  hasClerkPublicConfig,
  hasConvexPublicConfig,
  hasDatabaseUrl,
} from "@/lib/env";

/**
 * Readiness — Clerk + Convex required. Interim Postgres optional (non-Supabase).
 */
export async function GET() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  let convexReachable = false;
  if (convexUrl) {
    try {
      const res = await fetch(new URL("/version", convexUrl), {
        signal: AbortSignal.timeout(3000),
      });
      convexReachable = res.ok;
    } catch {
      convexReachable = false;
    }
  }

  const checks = {
    clerkConfigured: hasClerkPublicConfig(),
    convexConfigured: hasConvexPublicConfig(),
    convexReachable,
    /** Interim only — rejected if host is supabase.co */
    legacyPostgresConfigured: hasDatabaseUrl(),
  };

  const ready =
    checks.clerkConfigured && checks.convexConfigured && checks.convexReachable;

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      checks,
    },
    { status: ready ? 200 : 503 },
  );
}
