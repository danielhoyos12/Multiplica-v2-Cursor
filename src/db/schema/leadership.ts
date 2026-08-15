import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { cells } from "./cells";
import { ministries, networks, persons, users } from "./foundation";

export const leadershipStatusEnum = pgEnum("leadership_status", [
  "none",
  "eligible",
  "active",
  "inactive",
]);

/**
 * Pastoral leadership state — distinct from RBAC roles.
 * Active leaders MUST have primary_cell_id pointing to their own active cell.
 */
export const personLeadership = pgTable(
  "person_leadership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    status: leadershipStatusEnum("status").notNull().default("none"),
    ministryId: uuid("ministry_id")
      .notNull()
      .references(() => ministries.id, { onDelete: "restrict" }),
    networkId: uuid("network_id")
      .notNull()
      .references(() => networks.id, { onDelete: "restrict" }),
    /** Null only for official ministry root (Líder General). */
    directLeaderPersonId: uuid("direct_leader_person_id").references(() => persons.id, {
      onDelete: "restrict",
    }),
    /** Own primary cell — required when status=active. */
    primaryCellId: uuid("primary_cell_id").references(() => cells.id, {
      onDelete: "set null",
    }),
    /** Stable human pastoral code (identity aid, not PK). */
    humanLeaderCode: text("human_leader_code"),
    isMinistryRoot: boolean("is_ministry_root").notNull().default(false),
    eligibleAt: timestamp("eligible_at", { withTimezone: true }),
    eligibleByUserId: uuid("eligible_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    activatedByUserId: uuid("activated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deactivatedByUserId: uuid("deactivated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("person_leadership_person_id_uidx").on(table.personId),
    uniqueIndex("person_leadership_human_code_uidx").on(table.humanLeaderCode),
    index("person_leadership_status_idx").on(table.status),
    index("person_leadership_ministry_id_idx").on(table.ministryId),
    index("person_leadership_network_id_idx").on(table.networkId),
    index("person_leadership_direct_leader_idx").on(table.directLeaderPersonId),
    index("person_leadership_primary_cell_idx").on(table.primaryCellId),
  ],
);

/**
 * Closure table for efficient descendant / ancestor queries.
 * depth=0 is self. Maintained on activate / direct-leader changes.
 */
export const leadershipClosure = pgTable(
  "leadership_closure",
  {
    ancestorPersonId: uuid("ancestor_person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    descendantPersonId: uuid("descendant_person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
    ministryId: uuid("ministry_id")
      .notNull()
      .references(() => ministries.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      columns: [table.ancestorPersonId, table.descendantPersonId],
    }),
    index("leadership_closure_descendant_idx").on(table.descendantPersonId),
    index("leadership_closure_ministry_idx").on(table.ministryId),
    index("leadership_closure_ancestor_depth_idx").on(table.ancestorPersonId, table.depth),
  ],
);
