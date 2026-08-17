/**
 * Shared helpers for verify/provision scripts after Supabase removal.
 * Prefer skip + record over hard crash when Clerk / interim DB is missing.
 */
import { createClerkClient, type ClerkClient } from "@clerk/backend";

import {
  hasClerkPublicConfig,
  hasClerkSecret,
  hasConvexPublicConfig,
  hasDatabaseUrl,
  isSupabaseDatabaseUrl,
} from "../../src/lib/env";

export type CheckResult = { name: string; pass: boolean; detail?: string };

export function record(
  results: CheckResult[],
  name: string,
  pass: boolean,
  detail?: string,
) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

export function clerkSecretConfigured(): boolean {
  return hasClerkSecret();
}

export function recordClerkAndConvexConfig(results: CheckResult[]) {
  record(results, "Clerk public config", hasClerkPublicConfig());
  record(results, "CLERK_SECRET_KEY present", hasClerkSecret());
  record(results, "Convex public config", hasConvexPublicConfig());
}

/**
 * Interim Drizzle Postgres must be non-Supabase. Returns false (and records) when
 * missing or hosted on supabase.co — callers should skip DB-backed checks.
 */
export function recordInterimDatabaseReady(results: CheckResult[]): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) {
    record(
      results,
      "interim DATABASE_URL ready",
      false,
      "DATABASE_URL missing — skip Drizzle checks (prefer Convex)",
    );
    return false;
  }
  if (isSupabaseDatabaseUrl(url)) {
    record(
      results,
      "interim DATABASE_URL ready",
      false,
      "DATABASE_URL points at supabase.co — forbidden; use Convex or non-Supabase Postgres",
    );
    return false;
  }
  record(results, "interim DATABASE_URL ready", hasDatabaseUrl());
  return hasDatabaseUrl();
}

export function getClerkAdmin(): ClerkClient | null {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  return createClerkClient({ secretKey });
}

export type EphemeralClerkUser = {
  clerkUserId: string;
  email: string;
  password: string;
};

/** Create a Clerk user for live verify probes. Caller must delete when done. */
export async function createEphemeralClerkUser(
  email: string,
  password: string,
  publicMetadata?: Record<string, unknown>,
): Promise<EphemeralClerkUser> {
  const client = getClerkAdmin();
  if (!client) {
    throw new Error("CLERK_SECRET_KEY missing — cannot provision Clerk users");
  }
  const created = await client.users.createUser({
    emailAddress: [email],
    password,
    skipPasswordChecks: true,
    publicMetadata,
  });
  return { clerkUserId: created.id, email, password };
}

export async function deleteClerkUser(clerkUserId: string): Promise<void> {
  const client = getClerkAdmin();
  if (!client) return;
  try {
    await client.users.deleteUser(clerkUserId);
  } catch {
    /* best-effort cleanup */
  }
}

export async function findClerkUserIdByEmail(email: string): Promise<string | null> {
  const client = getClerkAdmin();
  if (!client) return null;
  const list = await client.users.getUserList({ emailAddress: [email], limit: 5 });
  return list.data[0]?.id ?? null;
}

export async function upsertClerkUserPassword(
  email: string,
  password: string,
  publicMetadata?: Record<string, unknown>,
): Promise<string> {
  const client = getClerkAdmin();
  if (!client) {
    throw new Error("CLERK_SECRET_KEY missing — cannot provision Clerk users");
  }
  const existingId = await findClerkUserIdByEmail(email);
  if (existingId) {
    await client.users.updateUser(existingId, {
      password,
      skipPasswordChecks: true,
      publicMetadata,
    });
    return existingId;
  }
  const created = await client.users.createUser({
    emailAddress: [email],
    password,
    skipPasswordChecks: true,
    publicMetadata,
  });
  return created.id;
}
