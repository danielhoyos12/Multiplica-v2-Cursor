/**
 * Phase 10 release verification — Clerk + Convex + interim Postgres (non-Supabase).
 * Never targets production.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { assertNotProductionTarget, redactDatabaseUrl } from "../src/lib/prod-guard";
import { safeInternalPath } from "../src/lib/safe-redirect";
import { runIntegrityChecks } from "../src/modules/reporting/integrity";
import { sanitizeCsvCell } from "../src/modules/reporting/csv";
import {
  hasClerkPublicConfig,
  hasClerkSecret,
  hasConvexPublicConfig,
  hasDatabaseUrl,
} from "../src/lib/env";
import { recordInterimDatabaseReady } from "./lib/verify-env";

type Result = { name: string; pass: boolean; detail?: string };

function record(results: Result[], name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function scanForSecrets(root: string, patterns: RegExp[]): string[] {
  const hits: string[] = [];
  if (!existsSync(root)) return hits;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name === "node_modules" || name.name === ".git") continue;
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (/\.(js|css|map|html|txt|md)$/.test(name.name)) {
        try {
          const text = readFileSync(p, "utf8");
          for (const re of patterns) {
            if (re.test(text)) hits.push(`${p} ~ ${re}`);
          }
        } catch {
          /* skip */
        }
      }
    }
  };
  walk(root);
  return hits;
}

async function main() {
  const results: Result[] = [];

  try {
    assertNotProductionTarget();
    record(results, "prod guard allows current env", true);
  } catch (e) {
    record(results, "prod guard allows current env", false, String(e));
  }

  record(results, "Clerk public config", hasClerkPublicConfig());
  record(results, "CLERK_SECRET_KEY present", hasClerkSecret());
  record(results, "Convex public config", hasConvexPublicConfig());
  const dbReady = recordInterimDatabaseReady(results);
  record(results, "database url configured (non-Supabase)", hasDatabaseUrl());
  record(
    results,
    "DATABASE_URL redacted helper",
    !redactDatabaseUrl(process.env.DATABASE_URL).includes(
      (process.env.DATABASE_URL ?? "").split("@")[0]?.split(":")[2] ?? "___never___",
    ) || !process.env.DATABASE_URL?.includes("@"),
  );

  record(results, "open redirect //evil blocked", safeInternalPath("//evil.com") === "/dashboard");
  record(results, "csv formula sanitize", sanitizeCsvCell("=1+1").startsWith("'"));

  const clerkSecret = process.env.CLERK_SECRET_KEY ?? "";
  const dbUrl = process.env.DATABASE_URL ?? "";
  const secretPatterns: RegExp[] = [];
  if (clerkSecret.length > 20) {
    secretPatterns.push(new RegExp(clerkSecret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  if (dbUrl.includes("@")) {
    const pass = (() => {
      try {
        return new URL(dbUrl).password;
      } catch {
        return "";
      }
    })();
    if (pass.length > 4) {
      secretPatterns.push(new RegExp(pass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }

  const bundleHits = scanForSecrets(join(process.cwd(), ".next/static"), secretPatterns);
  record(
    results,
    "bundle secret scan",
    bundleHits.length === 0,
    bundleHits.slice(0, 3).join("; ") || "clean",
  );

  const srcHits = scanForSecrets(join(process.cwd(), "src"), [
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  ]);
  // JWT-like hardcoded tokens in src (exclude placeholders)
  record(results, "src hardcoded JWT scan", srcHits.length === 0, srcHits[0]);

  if (dbReady) {
    try {
      const integrity = await runIntegrityChecks();
      record(
        results,
        "system health critical=0",
        integrity.criticalCount === 0,
        `critical=${integrity.criticalCount} warning=${integrity.warningCount}`,
      );
    } catch (e) {
      record(
        results,
        "system health critical=0",
        false,
        e instanceof Error ? e.message : String(e),
      );
    }
  } else {
    record(
      results,
      "system health critical=0",
      false,
      "skipped — interim DATABASE_URL unavailable or Supabase-hosted",
    );
  }

  const failed = results.filter((r) => !r.pass).length;
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nPhase 10 verify: PASS=${passed} FAIL=${failed} TOTAL=${results.length}`);
  console.log(`DATABASE_URL=${redactDatabaseUrl(process.env.DATABASE_URL)}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
