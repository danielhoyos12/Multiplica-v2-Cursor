import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { hasDatabaseUrl, hasSupabasePublicConfig } from "@/lib/env";
import { sql } from "drizzle-orm";

/**
 * Readiness — checks config + lightweight DB connectivity.
 * Does not return connection strings, schema, or secrets.
 */
export async function GET() {
  const checks = {
    publicConfig: hasSupabasePublicConfig(),
    databaseConfigured: hasDatabaseUrl(),
    databaseReachable: false,
  };

  if (checks.databaseConfigured) {
    try {
      const db = getDb();
      await db.execute(sql`select 1`);
      checks.databaseReachable = true;
    } catch {
      checks.databaseReachable = false;
    }
  }

  const ready =
    checks.publicConfig && checks.databaseConfigured && checks.databaseReachable;

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      checks,
    },
    { status: ready ? 200 : 503 },
  );
}
