import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ministries, networks, persons, users } from "./foundation";

/** Pastoral process ladder stages implemented in Phase 5 (+ future-ready). */
export const processTypeEnum = pgEnum("process_type", [
  "consolidar",
  "udv",
  "destino",
]);

export const processStatusEnum = pgEnum("process_status", [
  "pending",
  "in_progress",
  "completed",
  "paused",
  "abandoned",
]);

export const trainingCycleStatusEnum = pgEnum("training_cycle_status", [
  "planned",
  "active",
  "closed",
]);

export const trainingEnrollmentStatusEnum = pgEnum("training_enrollment_status", [
  "enrolled",
  "in_progress",
  "completed",
  "paused",
]);

export const trainingAttendanceStatusEnum = pgEnum("training_attendance_status", [
  "present",
  "absent",
  "excused",
  "recovered",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

/**
 * Reusable pastoral progress — references persons.id only (no person duplication).
 * One row per (person, process_type).
 */
export const personProcessProgress = pgTable(
  "person_process_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    processType: processTypeEnum("process_type").notNull(),
    stage: text("stage"),
    status: processStatusEnum("status").notNull().default("pending"),
    currentStep: text("current_step"),
    ministryId: uuid("ministry_id")
      .notNull()
      .references(() => ministries.id, { onDelete: "restrict" }),
    networkId: uuid("network_id").references(() => networks.id, {
      onDelete: "set null",
    }),
    assignedLeaderPersonId: uuid("assigned_leader_person_id").references(
      () => persons.id,
      { onDelete: "set null" },
    ),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Safe non-PII progress metadata (no prayer requests / secrets). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("person_process_progress_person_type_uidx").on(
      table.personId,
      table.processType,
    ),
    index("person_process_progress_person_id_idx").on(table.personId),
    index("person_process_progress_type_status_idx").on(
      table.processType,
      table.status,
    ),
    index("person_process_progress_ministry_id_idx").on(table.ministryId),
    index("person_process_progress_assigned_leader_idx").on(
      table.assignedLeaderPersonId,
    ),
  ],
);

/** Append-only pastoral process events. */
export const personProcessEvents = pgTable(
  "person_process_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    progressId: uuid("progress_id")
      .notNull()
      .references(() => personProcessProgress.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    processType: processTypeEnum("process_type").notNull(),
    eventType: text("event_type").notNull(),
    fromStatus: processStatusEnum("from_status"),
    toStatus: processStatusEnum("to_status"),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("person_process_events_progress_id_idx").on(table.progressId),
    index("person_process_events_person_id_idx").on(table.personId),
    index("person_process_events_type_idx").on(table.processType, table.eventType),
  ],
);

/** Configurable programs (UDV now; Destino / EM later). */
export const trainingPrograms = pgTable(
  "training_programs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("training_programs_code_uidx").on(table.code)],
);

export const trainingModules = pgTable(
  "training_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    isRequired: boolean("is_required").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("training_modules_program_code_uidx").on(table.programId, table.code),
    index("training_modules_program_order_idx").on(table.programId, table.orderIndex),
  ],
);

export const trainingCycles = pgTable(
  "training_cycles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: trainingCycleStatusEnum("status").notNull().default("planned"),
    ministryId: uuid("ministry_id").references(() => ministries.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("training_cycles_program_id_idx").on(table.programId),
    index("training_cycles_status_idx").on(table.status),
    index("training_cycles_ministry_id_idx").on(table.ministryId),
  ],
);

export const trainingEnrollments = pgTable(
  "training_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => trainingCycles.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    status: trainingEnrollmentStatusEnum("status").notNull().default("enrolled"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("training_enrollments_cycle_person_uidx").on(
      table.cycleId,
      table.personId,
    ),
    index("training_enrollments_person_id_idx").on(table.personId),
    index("training_enrollments_status_idx").on(table.status),
  ],
);

/**
 * Module attendance. Historical absent rows are never deleted —
 * recovery updates status to recovered and records authorization.
 */
export const trainingAttendance = pgTable(
  "training_attendance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => trainingEnrollments.id, { onDelete: "restrict" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => trainingModules.id, { onDelete: "restrict" }),
    attendanceDate: date("attendance_date").notNull(),
    status: trainingAttendanceStatusEnum("status").notNull(),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    recoveryAuthorizedByUserId: uuid("recovery_authorized_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    recoveryAuthorizedAt: timestamp("recovery_authorized_at", { withTimezone: true }),
    recoveryNote: text("recovery_note"),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("training_attendance_enrollment_module_uidx").on(
      table.enrollmentId,
      table.moduleId,
    ),
    index("training_attendance_enrollment_id_idx").on(table.enrollmentId),
    index("training_attendance_module_id_idx").on(table.moduleId),
    index("training_attendance_status_idx").on(table.status),
  ],
);

export const UDV_PROGRAM_CODE = "udv" as const;
export const DESTINO_PROGRAM_CODE = "destino" as const;
