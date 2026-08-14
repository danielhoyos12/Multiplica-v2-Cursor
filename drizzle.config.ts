import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  // Allow generate/introspect tooling to load; migrate/push still require DATABASE_URL.
  console.warn(
    "[drizzle.config] DATABASE_URL is not set. Migration apply commands will fail until it is configured.",
  );
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "postgresql://postgres:postgres@127.0.0.1:5432/multiplica",
  },
  strict: true,
  verbose: true,
});
