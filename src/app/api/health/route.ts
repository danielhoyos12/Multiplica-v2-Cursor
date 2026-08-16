import { NextResponse } from "next/server";

import { hasClerkPublicConfig } from "@/lib/env";

/**
 * Liveness probe — no secrets, no schema dump.
 * Deep readiness (DB) is /api/ready.
 */
export async function GET() {
  const ok = hasClerkPublicConfig();
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
