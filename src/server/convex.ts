import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";

import { DomainError, DomainErrorCode } from "@/lib/errors";

import { api } from "../../convex/_generated/api";

function requireConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new DomainError(
      DomainErrorCode.CONFIGURATION_ERROR,
      "NEXT_PUBLIC_CONVEX_URL is required. Run `npm run convex:dev` (anonymous local) or configure a Convex deployment.",
    );
  }
  return url;
}

/**
 * Unauthenticated Convex HTTP client.
 *
 * Use ONLY for explicitly public operations:
 * - `health.ping` (readiness)
 * - GANAR public intake (`persons.createPublic`, rate-limit queries)
 * - foundation catalogs needed by the public share-link form
 *
 * Never reuse this client for pastoral/authenticated work. Clerk
 * `ConvexProviderWithClerk` on the browser does not attach JWTs here.
 */
export function getPublicConvexClient(): ConvexHttpClient {
  return new ConvexHttpClient(requireConvexUrl());
}

/**
 * Per-request Convex HTTP client authenticated with the Clerk JWT template
 * named `convex`. Do not cache across requests — tokens are user-specific.
 *
 * Server Components, Server Actions, and Route Handlers must use this for
 * any query/mutation that reads or writes pastoral data.
 */
export async function getAuthenticatedConvexClient(): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(requireConvexUrl());
  const session = await auth();
  const token = await session.getToken({ template: "convex" });
  if (!token) {
    throw new DomainError(
      DomainErrorCode.UNAUTHENTICATED,
      "No hay un token Clerk válido para Convex. Inicia sesión con una cuenta habilitada.",
    );
  }
  client.setAuth(token);
  return client;
}

/**
 * @deprecated Use `getAuthenticatedConvexClient()` for pastoral data or
 * `getPublicConvexClient()` for explicitly public intake/health.
 *
 * Kept as an alias of the public client only so leftover call sites fail
 * closed once Convex functions require `ctx.auth` — prefer migrating callers.
 */
export function getConvexHttpClient(): ConvexHttpClient {
  return getPublicConvexClient();
}

export { api };
