import { NextResponse } from "next/server";

/**
 * Liveness probe — Next.js process is up. Configuration belongs on `/api/ready`.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "multiplica",
    version: process.env.npm_package_version ?? "1.0.0-rc.1",
    timestamp: new Date().toISOString(),
  });
}
