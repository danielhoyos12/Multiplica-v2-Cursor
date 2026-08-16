import { setDefaultResultOrder } from "node:dns";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { assertNotSupabaseDatabaseUrl } from "@/lib/env";

import * as schema from "./schema";

// Prefer IPv4 before any pool connection (cloud/CI often lack IPv6 routes).
setDefaultResultOrder("ipv4first");

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Interim Drizzle client for legacy pastoral modules not yet on Convex.
 * Supabase-hosted Postgres is rejected — use Convex or a non-Supabase Postgres.
 * Never import from client components.
 */
export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Legacy DATABASE_URL is not set. Prefer Convex (NEXT_PUBLIC_CONVEX_URL). " +
        "Interim Postgres (non-Supabase) is only for modules not yet migrated.",
    );
  }

  assertNotSupabaseDatabaseUrl(databaseUrl);

  if (!dbInstance) {
    client = postgres(databaseUrl, {
      max: 10,
      prepare: false,
      connect_timeout: 20,
    });
    dbInstance = drizzle(client, { schema });
  }

  return dbInstance;
}

export type Database = ReturnType<typeof getDb>;
