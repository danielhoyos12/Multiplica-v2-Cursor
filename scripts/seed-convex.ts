/**
 * Seeds Convex foundation catalogs (networks, Lima Metropolitana districts,
 * RBAC roles/permissions/role-permission map) via `convex/seed.ts`
 * `seedCatalogs`. Idempotent — safe to run repeatedly.
 *
 * Does NOT seed Ministerios Generales (Superadmin setup) or app users.
 *
 * Usage: npm run db:seed:convex
 * Requires NEXT_PUBLIC_CONVEX_URL (e.g. from `.env.local`, see `npm run convex:dev`).
 */
import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api";

async function main() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    console.error(
      "Missing NEXT_PUBLIC_CONVEX_URL. Run `npm run convex:dev` (anonymous local) or configure a Convex deployment.",
    );
    process.exit(1);
  }

  const client = new ConvexHttpClient(url);
  console.log(`Seeding Convex catalogs… target=${url}`);

  const result = await client.mutation(api.seed.seedCatalogs, {});

  console.log("Convex catalogs seeded:");
  console.log(`  networks=${result.networks}`);
  console.log(`  districts=${result.districts}`);
  console.log(`  roles=${result.roles}`);
  console.log(`  permissions=${result.permissions}`);
  console.log(`  rolePermissions=${result.rolePermissions}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
