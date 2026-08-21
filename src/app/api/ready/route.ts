import { NextResponse } from "next/server";

import { hasClerkPublicConfig, hasConvexPublicConfig } from "@/lib/env";
import { api, getPublicConvexClient } from "@/server/convex";

/**
 * Readiness — Clerk + Convex required. Postgres is not part of the new stack.
 * Reachability uses the public `health.ping` query (no secrets).
 */
export async function GET() {
  const convexConfigured = hasConvexPublicConfig();
  let convexReachable = false;
  if (convexConfigured) {
    try {
      const ping = await getPublicConvexClient().query(api.health.ping, {});
      convexReachable = ping.ok === true;
    } catch {
      convexReachable = false;
    }
  }

  const checks = {
    clerkConfigured: hasClerkPublicConfig(),
    convexConfigured,
    convexReachable,
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
