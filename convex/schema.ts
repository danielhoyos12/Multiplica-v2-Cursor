import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * MULTIPLICA Convex schema — primary data plane (Supabase removed).
 *
 * Foundation + pastoral tables. Interim non-Supabase Postgres may still
 * back unmigrated Drizzle modules; prefer Convex. See docs/supabase-removal.md.
 *
 * IDs: Convex document ids. `legacyPostgresId` optional for import.
 */

const timestamps = {
  createdAt: v.number(),
  updatedAt: v.number(),
};

const legacyId = v.optional(v.string());

export default defineSchema({
  /** Local-dev smoke only — not pastoral. */
  healthChecks: defineTable({
    label: v.string(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  districts: defineTable({
    name: v.string(),
    metroArea: v.string(),
    isActive: v.boolean(),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_metro_name", ["metroArea", "name"])
    .index("by_active", ["isActive"]),

  networks: defineTable({
    code: v.union(
      v.literal("hombres"),
      v.literal("mujeres"),
      v.literal("jovenes"),
      v.literal("ninos"),
    ),
    name: v.string(),
    isActive: v.boolean(),
    isConfigurable: v.boolean(),
    sortOrder: v.number(),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

  ministries: defineTable({
    code: v.string(),
    name: v.string(),
    isActive: v.boolean(),
    sortOrder: v.number(),
    /** App user id (Convex) of Líder General — optional. */
    responsibleUserId: v.optional(v.id("users")),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"])
    .index("by_responsibleUserId", ["responsibleUserId"]),

  persons: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    phone: v.optional(v.string()),
    phoneNormalized: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    districtId: v.optional(v.id("districts")),
    prayerRequest: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.union(v.literal("internal_form"), v.literal("public_form")),
    isActive: v.boolean(),
    registeredAt: v.number(),
    deletedAt: v.optional(v.number()),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_phoneNormalized", ["phoneNormalized"])
    .index("by_email", ["email"])
    .index("by_name", ["lastName", "firstName"])
    .index("by_registeredAt", ["registeredAt"])
    .index("by_active", ["isActive"]),

  /**
   * App profile. `authSubject` = Clerk user id (`user_…`) / Convex identity subject.
   * Prefer `identity.tokenIdentifier` for ownership checks when using ctx.auth.
   */
  users: defineTable({
    authSubject: v.string(),
    email: v.string(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    personId: v.optional(v.id("persons")),
    isActive: v.boolean(),
    mustChangePassword: v.boolean(),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_authSubject", ["authSubject"])
    .index("by_email", ["email"])
    .index("by_username", ["username"])
    .index("by_personId", ["personId"])
    .index("by_active", ["isActive"]),

  roles: defineTable({
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    scopeType: v.union(
      v.literal("global"),
      v.literal("ministry"),
      v.literal("network"),
      v.literal("tree"),
    ),
    isSystem: v.boolean(),
    legacyPostgresId: legacyId,
    ...timestamps,
  }).index("by_code", ["code"]),

  permissions: defineTable({
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    legacyPostgresId: legacyId,
    ...timestamps,
  }).index("by_code", ["code"]),

  rolePermissions: defineTable({
    roleId: v.id("roles"),
    permissionId: v.id("permissions"),
    createdAt: v.number(),
  })
    .index("by_role", ["roleId"])
    .index("by_permission", ["permissionId"])
    .index("by_role_permission", ["roleId", "permissionId"]),

  userRoleAssignments: defineTable({
    userId: v.id("users"),
    roleId: v.id("roles"),
    ministryId: v.optional(v.id("ministries")),
    networkId: v.optional(v.id("networks")),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    legacyPostgresId: legacyId,
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_role", ["roleId"])
    .index("by_ministry", ["ministryId"])
    .index("by_network", ["networkId"]),

  cells: defineTable({
    code: v.optional(v.string()),
    name: v.string(),
    type: v.union(v.literal("evangelistic"), v.literal("twelve")),
    ministryId: v.id("ministries"),
    networkId: v.id("networks"),
    responsiblePersonId: v.optional(v.id("persons")),
    responsibleUserId: v.optional(v.id("users")),
    dayOfWeek: v.optional(
      v.union(
        v.literal("monday"),
        v.literal("tuesday"),
        v.literal("wednesday"),
        v.literal("thursday"),
        v.literal("friday"),
        v.literal("saturday"),
        v.literal("sunday"),
      ),
    ),
    startTime: v.optional(v.string()),
    timezone: v.string(),
    address: v.optional(v.string()),
    districtId: v.optional(v.id("districts")),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("closed"),
    ),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_ministry", ["ministryId"])
    .index("by_network", ["networkId"])
    .index("by_responsiblePersonId", ["responsiblePersonId"])
    .index("by_status", ["status"]),

  cellMemberships: defineTable({
    cellId: v.id("cells"),
    personId: v.id("persons"),
    status: v.union(
      v.literal("active"),
      v.literal("left"),
      v.literal("transferred"),
    ),
    role: v.union(v.literal("member"), v.literal("twelve_team")),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_cell", ["cellId"])
    .index("by_person", ["personId"])
    .index("by_cell_person", ["cellId", "personId"]),

  personLeadership: defineTable({
    personId: v.id("persons"),
    status: v.union(
      v.literal("none"),
      v.literal("eligible"),
      v.literal("active"),
      v.literal("inactive"),
    ),
    ministryId: v.id("ministries"),
    networkId: v.id("networks"),
    directLeaderPersonId: v.optional(v.id("persons")),
    primaryCellId: v.optional(v.id("cells")),
    humanLeaderCode: v.optional(v.string()),
    isMinistryRoot: v.boolean(),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_person", ["personId"])
    .index("by_status", ["status"])
    .index("by_ministry", ["ministryId"])
    .index("by_directLeader", ["directLeaderPersonId"])
    .index("by_humanLeaderCode", ["humanLeaderCode"]),
});
