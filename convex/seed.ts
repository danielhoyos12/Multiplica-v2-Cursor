import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import {
  assertPreviewBootstrapAllowed,
  seedFoundationCatalogs,
} from "./lib/seedFoundation";

const catalogSeedReturns = v.object({
  networks: v.number(),
  districts: v.number(),
  roles: v.number(),
  permissions: v.number(),
  rolePermissions: v.number(),
});

/**
 * Idempotent seed of foundation catalogs: networks, Lima Metropolitana
 * districts, RBAC roles, permissions, and the role → permission map.
 * Safe to call repeatedly (upserts by natural key / index lookup).
 *
 * Does NOT seed Ministerios Generales (Superadmin setup) or app users.
 *
 * Internal-only — not callable from the Next.js client. Run:
 * `npx convex run seed:seedCatalogs` (CLI uses the admin deploy key).
 */
export const seedCatalogs = internalMutation({
  args: {},
  returns: catalogSeedReturns,
  handler: async (ctx) => seedFoundationCatalogs(ctx),
});

/**
 * Preview-only entrypoint for `npx convex deploy --preview-run`.
 * Reuses seedFoundationCatalogs. Refuses to run unless
 * ALLOW_PREVIEW_BOOTSTRAP is exactly `"true"`.
 *
 * Does not seed persons, users, ministries, assignments,
 * pastoral rows, auth providers, or training catalogs.
 */
export const bootstrapPreview = internalMutation({
  args: {},
  returns: catalogSeedReturns,
  handler: async (ctx) => {
    assertPreviewBootstrapAllowed();
    return await seedFoundationCatalogs(ctx);
  },
});
