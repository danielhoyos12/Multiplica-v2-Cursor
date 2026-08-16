import { NextResponse } from "next/server";

import { hasClerkPublicConfig, hasConvexPublicConfig } from "@/lib/env";

/**
 * Liveness probe — Clerk + Convex public config (no secrets).
 */
export async function GET() {
  const ok = hasClerkPublicConfig() && hasConvexPublicConfig();
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      service: "multiplica",
      version: process.env.npm_package_version ?? "1.0.0-rc.1",
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
