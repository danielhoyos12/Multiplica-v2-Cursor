/**
 * Phase 8 — pastoral transfers, leadership relationship history, cell leadership history.
 */
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { cells } from "./cells";
import { ministries, networks, persons, users } from "./foundation";

export const transferTypeEnum = pgEnum("transfer_type", [
  "network_change",
  "ministry_change",
  "cell_membership_transfer",
  "direct_leader_change",
  "subtree_move",
  "cell_reassignment",
  "leader_deactivation",
]);

export const transferStatusEnum = pgEnum("transfer_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
  "executed",
  "cancelled",
]);

export const transferStructureModeEnum = pgEnum("transfer_structure_mode", [
  "move_with_structure",
  "move_person_only_and_reassign_structure",
  "not_applicable",
]);

/**
 * Planned pastoral transfers — request → approval → execute.
 * Executed rows are immutable (idempotent guard).
 */
export const pastoralTransferRequests = pgTable(
  "pastoral_transfer_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    transferType: transferTypeEnum("transfer_type").notNull(),
    structureMode: transferStructureModeEnum("structure_mode")
      .notNull()
      .default("not_applicable"),
    status: transferStatusEnum("status").notNull().default("draft"),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sourceMinistryId: uuid("source_ministry_id").references(() => ministries.id, {
      onDelete: "restrict",
    }),
    sourceNetworkId: uuid("source_network_id").references(() => networks.id, {
      onDelete: "restrict",
    }),
    destinationMinistryId: uuid("destination_ministry_id").references(() => ministries.id, {
      onDelete: "restrict",
    }),
    destinationNetworkId: uuid("destination_network_id").references(() => networks.id, {
      onDelete: "restrict",
    }),
    proposedDirectLeaderPersonId: uuid("proposed_direct_leader_person_id").references(
      () => persons.id,
      { onDelete: "restrict" },
    ),
    /** Target cell for membership / reassignment operations. */
    targetCellId: uuid("target_cell_id").references(() => cells.id, {
      onDelete: "restrict",
    }),
    reason: text("reason").notNull(),
    /** Preview / plan payload (impact counts, reassignment map). */
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull().default({}),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedByUserId: uuid("rejected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    executedByUserId: uuid("executed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pastoral_transfer_requests_person_idx").on(table.personId),
    index("pastoral_transfer_requests_status_idx").on(table.status),
    index("pastoral_transfer_requests_type_idx").on(table.transferType),
    index("pastoral_transfer_requests_source_ministry_idx").on(table.sourceMinistryId),
    index("pastoral_transfer_requests_dest_ministry_idx").on(table.destinationMinistryId),
    index("pastoral_transfer_requests_requested_by_idx").on(table.requestedByUserId),
    index("pastoral_transfer_requests_approved_by_idx").on(table.approvedByUserId),
  ],
);

/** Historical direct-leader changes (closure is current-state only). */
export const leadershipRelationshipHistory = pgTable(
  "leadership_relationship_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    oldDirectLeaderPersonId: uuid("old_direct_leader_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    newDirectLeaderPersonId: uuid("new_direct_leader_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    ministryId: uuid("ministry_id").references(() => ministries.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    transferRequestId: uuid("transfer_request_id").references(
      () => pastoralTransferRequests.id,
      { onDelete: "set null" },
    ),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("leadership_relationship_history_person_idx").on(table.personId),
    index("leadership_relationship_history_changed_idx").on(table.changedAt),
  ],
);

/** Historical cell responsible changes. */
export const cellLeadershipHistory = pgTable(
  "cell_leadership_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cellId: uuid("cell_id")
      .notNull()
      .references(() => cells.id, { onDelete: "restrict" }),
    oldResponsiblePersonId: uuid("old_responsible_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    newResponsiblePersonId: uuid("new_responsible_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    transferRequestId: uuid("transfer_request_id").references(
      () => pastoralTransferRequests.id,
      { onDelete: "set null" },
    ),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("cell_leadership_history_cell_idx").on(table.cellId),
    index("cell_leadership_history_changed_idx").on(table.changedAt),
  ],
);

export const ENVIAR_PROCESS = "enviar" as const;
export const ENVIAR_FAMILY = "enviar" as const;
