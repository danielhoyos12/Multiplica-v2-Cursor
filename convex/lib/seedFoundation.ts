import {
  LIMA_METROPOLITANA_DISTRICTS,
  NETWORK_SEEDS,
  PERMISSION_SEEDS,
  ROLE_PERMISSION_MAP,
  ROLE_SEEDS,
} from "../../src/db/seeds/data";
import type { MutationCtx } from "../_generated/server";
import { now } from "./time";

const LIMA_METRO_AREA = "Lima Metropolitana";

export const ALLOW_PREVIEW_BOOTSTRAP_ENV = "ALLOW_PREVIEW_BOOTSTRAP";
export const ALLOW_PREVIEW_BOOTSTRAP_VALUE = "true";

export type FoundationSeedCounts = {
  networks: number;
  districts: number;
  roles: number;
  permissions: number;
  rolePermissions: number;
};

/**
 * Preview-only gate for `seed:bootstrapPreview`.
 * Fail-closed: only the exact string `"true"` is allowed.
 */
export function assertPreviewBootstrapAllowed() {
  if (process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV] !== ALLOW_PREVIEW_BOOTSTRAP_VALUE) {
    throw new Error(
      "seed:bootstrapPreview refused: ALLOW_PREVIEW_BOOTSTRAP is not 'true'. Preview-only.",
    );
  }
}

async function seedNetworks(ctx: MutationCtx) {
  let count = 0;
  for (const network of NETWORK_SEEDS) {
    const existing = await ctx.db
      .query("networks")
      .withIndex("by_code", (q) => q.eq("code", network.code))
      .unique();

    if (existing) {
      await ctx.db.patch("networks", existing._id, {
        name: network.name,
        isActive: network.isActive,
        isConfigurable: network.isConfigurable,
        sortOrder: network.sortOrder,
        updatedAt: now(),
      });
    } else {
      await ctx.db.insert("networks", {
        code: network.code,
        name: network.name,
        isActive: network.isActive,
        isConfigurable: network.isConfigurable,
        sortOrder: network.sortOrder,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    count += 1;
  }
  return count;
}

async function seedDistricts(ctx: MutationCtx) {
  let count = 0;
  for (const name of LIMA_METROPOLITANA_DISTRICTS) {
    const existing = await ctx.db
      .query("districts")
      .withIndex("by_metro_name", (q) => q.eq("metroArea", LIMA_METRO_AREA).eq("name", name))
      .unique();

    if (!existing) {
      await ctx.db.insert("districts", {
        name,
        metroArea: LIMA_METRO_AREA,
        isActive: true,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    count += 1;
  }
  return count;
}

async function seedRoles(ctx: MutationCtx) {
  let count = 0;
  for (const role of ROLE_SEEDS) {
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_code", (q) => q.eq("code", role.code))
      .unique();

    if (existing) {
      await ctx.db.patch("roles", existing._id, {
        name: role.name,
        description: role.description,
        scopeType: role.scopeType,
        updatedAt: now(),
      });
    } else {
      await ctx.db.insert("roles", {
        code: role.code,
        name: role.name,
        description: role.description,
        scopeType: role.scopeType,
        isSystem: true,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    count += 1;
  }
  return count;
}

async function seedPermissions(ctx: MutationCtx) {
  let count = 0;
  for (const permission of PERMISSION_SEEDS) {
    const existing = await ctx.db
      .query("permissions")
      .withIndex("by_code", (q) => q.eq("code", permission.code))
      .unique();

    if (existing) {
      await ctx.db.patch("permissions", existing._id, {
        name: permission.name,
        description: permission.description,
        updatedAt: now(),
      });
    } else {
      await ctx.db.insert("permissions", {
        code: permission.code,
        name: permission.name,
        description: permission.description,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    count += 1;
  }
  return count;
}

async function seedRolePermissions(ctx: MutationCtx) {
  let count = 0;
  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = await ctx.db
      .query("roles")
      .withIndex("by_code", (q) => q.eq("code", roleCode))
      .unique();
    if (!role) continue;

    for (const permissionCode of permissionCodes) {
      const permission = await ctx.db
        .query("permissions")
        .withIndex("by_code", (q) => q.eq("code", permissionCode))
        .unique();
      if (!permission) continue;

      const existingLink = await ctx.db
        .query("rolePermissions")
        .withIndex("by_role_permission", (q) =>
          q.eq("roleId", role._id).eq("permissionId", permission._id),
        )
        .unique();

      if (!existingLink) {
        await ctx.db.insert("rolePermissions", {
          roleId: role._id,
          permissionId: permission._id,
          createdAt: now(),
        });
      }
      count += 1;
    }
  }
  return count;
}

/**
 * Idempotent foundation catalogs only: networks, districts, roles,
 * permissions, rolePermissions. Does not seed ministries, persons, users,
 * userRoleAssignments, Clerk, or formation.
 */
export async function seedFoundationCatalogs(ctx: MutationCtx): Promise<FoundationSeedCounts> {
  const networks = await seedNetworks(ctx);
  const districts = await seedDistricts(ctx);
  const roles = await seedRoles(ctx);
  const permissions = await seedPermissions(ctx);
  const rolePermissions = await seedRolePermissions(ctx);

  return { networks, districts, roles, permissions, rolePermissions };
}
