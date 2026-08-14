import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Server-only Drizzle client. Never import this module from client components.
 * Uses DATABASE_URL (prefer pooled connection for runtime).
 */
export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for database access. Configure it in the environment.",
    );
  }

  if (!dbInstance) {
    client = postgres(databaseUrl, {
      max: 10,
      prepare: false,
    });
    dbInstance = drizzle(client, { schema });
  }

  return dbInstance;
}

export type Database = ReturnType<typeof getDb>;
