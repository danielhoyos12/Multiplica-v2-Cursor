/**
 * Release orchestrator — runs safe verification steps in order.
 * Does not deploy. Does not target production.
 */
import { spawnSync } from "node:child_process";

import { assertNotProductionTarget, redactDatabaseUrl } from "../src/lib/prod-guard";

function run(label: string, command: string, args: string[]) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (res.status !== 0) {
    console.error(`FAIL ${label}`);
    process.exit(res.status ?? 1);
  }
  console.log(`PASS ${label}`);
}

function main() {
  assertNotProductionTarget();
  console.log(`Release verify target DB=${redactDatabaseUrl(process.env.DATABASE_URL)}`);

  run("lint", "npm", ["run", "lint"]);
  run("typecheck", "npm", ["run", "typecheck"]);
  run("test", "npm", ["test"]);
  run("invariants", "npx", ["tsx", "--env-file=.env.local", "scripts/verify-data-invariants.ts"]);
  run("phase10", "npx", ["tsx", "--env-file=.env.local", "scripts/verify-phase10-release.ts"]);

  console.log("\nverify-release PASS");
}

main();
