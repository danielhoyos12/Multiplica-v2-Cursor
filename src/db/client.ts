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
 * Legacy-only Drizzle client. The MULTIPLICA pastoral data plane is Convex
 * (`src/server/convex.ts`) — auth (Clerk), organization, and all pastoral
 * modules (persons, cells, leadership, formation, transfers, reporting)
 * read/write Convex. `getDb()` must not be used by `src/modules/*` or
 * `src/app/*`. It remains solely for historical Postgres seeds
 * (`src/db/seeds/run.ts`) and unused verify scripts. Supabase-hosted
 * Postgres is rejected regardless.
 * Never import from client components.
 */
export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Legacy DATABASE_URL is not set. The pastoral data plane is Convex " +
        "(NEXT_PUBLIC_CONVEX_URL) — getDb() is legacy-only and should not be used by " +
        "modules already migrated (auth, organization, authorization). Interim " +
        "Postgres (non-Supabase) is only for modules not yet migrated.",
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
