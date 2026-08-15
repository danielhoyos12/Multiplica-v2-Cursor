import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const assignmentScopeEnum = pgEnum("assignment_scope", [
  "global",
  "ministry",
  "network",
  "tree",
]);

export const networkCodeEnum = pgEnum("network_code", [
  "hombres",
  "mujeres",
  "jovenes",
  "ninos",
]);

export const personSourceEnum = pgEnum("person_source", [
  "internal_form",
  "public_form",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const districts = pgTable(
  "districts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    metroArea: text("metro_area").notNull().default("Lima Metropolitana"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("districts_metro_area_name_uidx").on(table.metroArea, table.name),
    index("districts_is_active_idx").on(table.isActive),
  ],
);

export const ministries = pgTable(
  "ministries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Human-readable code (e.g. LP1). Never used as PK. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Assigned Líder General (user profile). Optional until appointed. */
    responsibleUserId: uuid("responsible_user_id").references(
      (): AnyPgColumn => users.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("ministries_code_uidx").on(table.code),
    index("ministries_is_active_idx").on(table.isActive),
    index("ministries_responsible_user_id_idx").on(table.responsibleUserId),
  ],
);

export const networks = pgTable(
  "networks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: networkCodeEnum("code").notNull(),
    name: text("name").notNull(),
    /** Niños starts disabled / configurable until pastoral policy activates it. */
    isActive: boolean("is_active").notNull().default(true),
    isConfigurable: boolean("is_configurable").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("networks_code_uidx").on(table.code)],
);

export const persons = pgTable(
  "persons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    /** Digits-only normalized phone for strong duplicate detection. */
    phoneNormalized: text("phone_normalized"),
    email: text("email"),
    address: text("address"),
    districtId: uuid("district_id").references(() => districts.id, {
      onDelete: "set null",
    }),
    /** Pastoral prayer request — sensitive; never put full text in audit logs. */
    prayerRequest: text("prayer_request"),
    notes: text("notes"),
    source: personSourceEnum("source").notNull().default("internal_form"),
    isActive: boolean("is_active").notNull().default(true),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("persons_phone_idx").on(table.phone),
    index("persons_phone_normalized_idx").on(table.phoneNormalized),
    index("persons_email_idx").on(table.email),
    index("persons_district_id_idx").on(table.districtId),
    index("persons_name_idx").on(table.lastName, table.firstName),
    index("persons_registered_at_idx").on(table.registeredAt),
    index("persons_source_idx").on(table.source),
    index("persons_is_active_idx").on(table.isActive),
  ],
);

/**
 * Application user profile mapped 1:1 to Supabase Auth `auth.users.id`.
 * FK to auth.users is enforced in SQL/RLS docs; Drizzle keeps a stable UUID PK.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    personId: uuid("person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    /** System-generated unique username (never the UUID). */
    username: text("username"),
    displayName: text("display_name"),
    isActive: boolean("is_active").notNull().default(true),
    /** Force password change after temporary credential provisioning. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_uidx").on(table.email),
    uniqueIndex("users_person_id_uidx").on(table.personId),
    uniqueIndex("users_username_uidx").on(table.username),
    index("users_is_active_idx").on(table.isActive),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    scopeType: assignmentScopeEnum("scope_type").notNull().default("global"),
    isSystem: boolean("is_system").notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("roles_code_uidx").on(table.code)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [uniqueIndex("permissions_code_uidx").on(table.code)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("role_permissions_permission_id_idx").on(table.permissionId),
  ],
);

export const userRoleAssignments = pgTable(
  "user_role_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    ministryId: uuid("ministry_id").references(() => ministries.id, {
      onDelete: "set null",
    }),
    networkId: uuid("network_id").references(() => networks.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    index("user_role_assignments_user_id_idx").on(table.userId),
    index("user_role_assignments_role_id_idx").on(table.roleId),
    index("user_role_assignments_ministry_id_idx").on(table.ministryId),
    index("user_role_assignments_network_id_idx").on(table.networkId),
    index("user_role_assignments_active_idx").on(table.userId, table.endsAt),
  ],
);

/**
 * Temporal membership of a person in Ministry/Network.
 * Changing Red/Ministerio must append history — never invent a new person.
 */
export const personOrganizationHistory = pgTable(
  "person_organization_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    ministryId: uuid("ministry_id").references(() => ministries.id, {
      onDelete: "set null",
    }),
    networkId: uuid("network_id").references(() => networks.id, {
      onDelete: "set null",
    }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    changeReason: text("change_reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("person_org_history_person_id_idx").on(table.personId),
    index("person_org_history_ministry_id_idx").on(table.ministryId),
    index("person_org_history_network_id_idx").on(table.networkId),
    index("person_org_history_effective_idx").on(
      table.personId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    beforeData: jsonb("before_data").$type<Record<string, unknown> | null>(),
    afterData: jsonb("after_data").$type<Record<string, unknown> | null>(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_actor_user_id_idx").on(table.actorUserId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_action_idx").on(table.action),
  ],
);

/**
 * Public GANAR intake telemetry / rate-limit support.
 * No prayer text. person_id may be null when submission was rejected/rate-limited.
 */
export const personIntakeEvents = pgTable(
  "person_intake_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personId: uuid("person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    ministryId: uuid("ministry_id").references(() => ministries.id, {
      onDelete: "set null",
    }),
    networkId: uuid("network_id").references(() => networks.id, {
      onDelete: "set null",
    }),
    source: personSourceEnum("source").notNull(),
    outcome: text("outcome").notNull(),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("person_intake_events_created_at_idx").on(table.createdAt),
    index("person_intake_events_ip_hash_idx").on(table.ipHash),
    index("person_intake_events_person_id_idx").on(table.personId),
  ],
);
