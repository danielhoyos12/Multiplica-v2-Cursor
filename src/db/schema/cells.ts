import {
  date,
  index,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { districts, ministries, networks, persons, users } from "./foundation";

export const cellTypeEnum = pgEnum("cell_type", ["evangelistic", "twelve"]);

export const cellStatusEnum = pgEnum("cell_status", [
  "active",
  "inactive",
  "closed",
]);

export const dayOfWeekEnum = pgEnum("day_of_week", [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export const cellMembershipStatusEnum = pgEnum("cell_membership_status", [
  "active",
  "left",
  "transferred",
]);

/** Why the person belongs to the cell — twelve_team allows dual membership with own cell responsibility. */
export const cellMembershipRoleEnum = pgEnum("cell_membership_role", [
  "member",
  "twelve_team",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "excused",
]);

export const attendanceSessionStatusEnum = pgEnum("attendance_session_status", [
  "open",
  "completed",
  "cancelled",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

/**
 * Operational cell. Members always reference persons (GANAR master identity).
 * Leadership tree / activation belongs to Phase 4 — responsible_person_id is the
 * Phase 3 placeholder linking to Persona Maestra; responsible_user_id prepares auth link.
 */
export const cells = pgTable(
  "cells",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Optional human code prepared for pastoral labeling (not PK). */
    code: text("code"),
    name: text("name").notNull(),
    type: cellTypeEnum("type").notNull(),
    ministryId: uuid("ministry_id")
      .notNull()
      .references(() => ministries.id, { onDelete: "restrict" }),
    networkId: uuid("network_id")
      .notNull()
      .references(() => networks.id, { onDelete: "restrict" }),
    /** Persona Maestra responsible for the cell (Phase 3). */
    responsiblePersonId: uuid("responsible_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    /**
     * Optional link to app user for future leader activation (Phase 4).
     * Not required to operate cells in Phase 3.
     */
    responsibleUserId: uuid("responsible_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),
    startTime: time("start_time").notNull(),
    timezone: text("timezone").notNull().default("America/Lima"),
    address: text("address"),
    districtId: uuid("district_id").references(() => districts.id, {
      onDelete: "set null",
    }),
    status: cellStatusEnum("status").notNull().default("active"),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("cells_code_uidx").on(table.code),
    index("cells_ministry_id_idx").on(table.ministryId),
    index("cells_network_id_idx").on(table.networkId),
    index("cells_responsible_person_id_idx").on(table.responsiblePersonId),
    index("cells_responsible_user_id_idx").on(table.responsibleUserId),
    index("cells_status_idx").on(table.status),
    index("cells_type_idx").on(table.type),
  ],
);

export const cellMemberships = pgTable(
  "cell_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cellId: uuid("cell_id")
      .notNull()
      .references(() => cells.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    status: cellMembershipStatusEnum("status").notNull().default("active"),
    role: cellMembershipRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    leaveReason: text("leave_reason"),
    ...timestamps,
  },
  (table) => [
    index("cell_memberships_cell_id_idx").on(table.cellId),
    index("cell_memberships_person_id_idx").on(table.personId),
    index("cell_memberships_status_idx").on(table.status),
    index("cell_memberships_active_person_idx").on(table.personId, table.status),
  ],
);

export const cellAttendanceSessions = pgTable(
  "cell_attendance_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cellId: uuid("cell_id")
      .notNull()
      .references(() => cells.id, { onDelete: "restrict" }),
    sessionDate: date("session_date").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    status: attendanceSessionStatusEnum("status").notNull().default("open"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cell_attendance_sessions_cell_date_uidx").on(
      table.cellId,
      table.sessionDate,
    ),
    index("cell_attendance_sessions_cell_id_idx").on(table.cellId),
    index("cell_attendance_sessions_date_idx").on(table.sessionDate),
  ],
);

export const cellAttendance = pgTable(
  "cell_attendance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => cellAttendanceSessions.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id").references(() => cellMemberships.id, {
      onDelete: "set null",
    }),
    status: attendanceStatusEnum("status").notNull(),
    notes: text("notes"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cell_attendance_session_person_uidx").on(table.sessionId, table.personId),
    index("cell_attendance_session_id_idx").on(table.sessionId),
    index("cell_attendance_person_id_idx").on(table.personId),
    index("cell_attendance_status_idx").on(table.status),
  ],
);

/** Soft documentation alias — max direct cells invariant prepared for Phase 4 leadership. */
export const MAX_DIRECT_CELLS_PER_RESPONSIBLE = 2 as const;
