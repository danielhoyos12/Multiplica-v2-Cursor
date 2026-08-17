/**
 * Seeds Convex foundation catalogs via internal mutation `seed:seedCatalogs`.
 * Idempotent. CLI uses the Convex admin key (not the public HTTP client).
 *
 * Usage: npm run db:seed:convex
 */
import { spawnSync } from "node:child_process";

async function main() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    console.error(
      "Missing NEXT_PUBLIC_CONVEX_URL. Run `npm run convex:dev` (anonymous local) or configure a Convex deployment.",
    );
    process.exit(1);
  }

  console.log(`Seeding Convex catalogs… target=${url}`);
  const result = spawnSync(
    "npx",
    ["convex", "run", "seed:seedCatalogs"],
    { stdio: "inherit", env: process.env },
  );
  process.exit(result.status === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
