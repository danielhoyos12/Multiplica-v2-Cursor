/**
 * Phase 10 release verification — coordinates safe checks against multiplica-dev.
 * Never targets production.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { assertNotProductionTarget, redactDatabaseUrl } from "../src/lib/prod-guard";
import { safeInternalPath } from "../src/lib/safe-redirect";
import { runIntegrityChecks } from "../src/modules/reporting/integrity";
import { sanitizeCsvCell } from "../src/modules/reporting/csv";
import { hasDatabaseUrl, hasSupabasePublicConfig } from "../src/lib/env";

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

  record(results, "public supabase config", hasSupabasePublicConfig());
  record(results, "database url configured", hasDatabaseUrl());
  record(
    results,
    "DATABASE_URL redacted helper",
    !redactDatabaseUrl(process.env.DATABASE_URL).includes(
      (process.env.DATABASE_URL ?? "").split("@")[0]?.split(":")[2] ?? "___never___",
    ) || !process.env.DATABASE_URL?.includes("@"),
  );

  record(results, "open redirect //evil blocked", safeInternalPath("//evil.com") === "/dashboard");
  record(results, "csv formula sanitize", sanitizeCsvCell("=1+1").startsWith("'"));

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const dbUrl = process.env.DATABASE_URL ?? "";
  const secretPatterns: RegExp[] = [];
  if (serviceKey.length > 20) {
    secretPatterns.push(new RegExp(serviceKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const tables = [
    "persons",
    "cells",
    "person_leadership",
    "pastoral_transfer_requests",
    "audit_logs",
    "person_process_progress",
  ];
  for (const t of tables) {
    const res = await anon.from(t).select("id").limit(3);
    const denied =
      Boolean(res.error) || (res.data?.length ?? 0) === 0 || res.error?.code === "PGRST301";
    // Empty + error both acceptable for deny-by-default
    record(
      results,
      `anonymous ${t} DENY/empty`,
      Boolean(res.error) || (res.data?.length ?? 0) === 0,
      res.error?.message ?? `rows=${res.data?.length ?? 0}`,
    );
    void denied;
  }

  const integrity = await runIntegrityChecks();
  record(
    results,
    "system health critical=0",
    integrity.criticalCount === 0,
    `critical=${integrity.criticalCount} warning=${integrity.warningCount}`,
  );

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
