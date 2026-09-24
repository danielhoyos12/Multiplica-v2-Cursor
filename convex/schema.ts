import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * MULTIPLICA Convex schema — full pastoral data plane (Supabase removed).
 *
 * Foundation, cells, leadership, formation/training, transfers, audit.
 * Mirrors `src/db/schema/*` (Drizzle/Postgres) so legacy rows can be
 * imported via `legacyPostgresId` while the app runs entirely on Convex.
 *
 * IDs: Convex document ids (`_id`). `legacyPostgresId` optional for import
 * traceability on entities that previously had a Postgres UUID row.
 */

const timestamps = {
  createdAt: v.number(),
  updatedAt: v.number(),
};

const legacyId = v.optional(v.string());

/** Pastoral process types — mirrors Drizzle `process_type` enum (legacy aliases kept). */
const processType = v.union(
  v.literal("consolidar"),
  v.literal("udv"), // DEPRECATED — umbrella/legacy; not a gate before CD1
  v.literal("destino"), // DEPRECATED aggregate
  v.literal("destino_n1"), // ACTIVE alias for Capacitación Destino 1 (cd1)
  v.literal("destino_n2"), // ACTIVE alias for Capacitación Destino 2 (cd2)
  v.literal("destino_n3"), // ACTIVE alias for Capacitación Destino 3 (cd3)
  v.literal("escuela_ministerial"), // DEPRECATED — use em1|em2|em3
  v.literal("reencuentro"),
  v.literal("pre_encuentro"),
  v.literal("encuentro"),
  v.literal("post_encuentro"),
  v.literal("em1"),
  v.literal("em2"),
  v.literal("em3"),
  v.literal("enviar"), // culmination; ungido ≠ active
);

const processStatus = v.union(
  v.literal("pending"),
  v.literal("eligible"),
  v.literal("in_progress"),
  v.literal("academic_completed"),
  v.literal("completed"),
  v.literal("paused"),
  v.literal("abandoned"),
);

export default defineSchema({
  /** Local-dev smoke only — not pastoral. */
  healthChecks: defineTable({
    label: v.string(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  // ---------------------------------------------------------------------
  // Foundation catalogs
  // ---------------------------------------------------------------------

  districts: defineTable({
    name: v.string(),
    metroArea: v.string(),
    isActive: v.boolean(),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_metro_name", ["metroArea", "name"])
    .index("by_active", ["isActive"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

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
    .index("by_active", ["isActive"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

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
    .index("by_responsibleUserId", ["responsibleUserId"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

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
    .index("by_active", ["isActive"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

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
    .index("by_active", ["isActive"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

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
  })
    .index("by_code", ["code"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  permissions: defineTable({
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

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
    .index("by_network", ["networkId"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /**
   * Temporal membership of a person in Ministry/Network.
   * Changing Red/Ministerio must append history — never invent a new person.
   */
  personOrganizationHistory: defineTable({
    personId: v.id("persons"),
    ministryId: v.optional(v.id("ministries")),
    networkId: v.optional(v.id("networks")),
    effectiveFrom: v.number(),
    effectiveTo: v.optional(v.number()),
    changeReason: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
    legacyPostgresId: legacyId,
    createdAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_ministry", ["ministryId"])
    .index("by_network", ["networkId"])
    .index("by_person_effectiveFrom", ["personId", "effectiveFrom"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /** Generic append-only audit trail for sensitive mutations. */
  auditLogs: defineTable({
    actorUserId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    beforeData: v.optional(v.any()),
    afterData: v.optional(v.any()),
    metadata: v.optional(v.any()),
    reason: v.optional(v.string()),
    requestId: v.optional(v.string()),
    legacyPostgresId: legacyId,
    createdAt: v.number(),
  })
    .index("by_actorUserId", ["actorUserId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_action", ["action"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /**
   * Public GANAR intake telemetry / rate-limit support.
   * No prayer text. personId may be absent when submission was rejected/rate-limited.
   */
  personIntakeEvents: defineTable({
    personId: v.optional(v.id("persons")),
    ministryId: v.optional(v.id("ministries")),
    networkId: v.optional(v.id("networks")),
    source: v.union(v.literal("internal_form"), v.literal("public_form")),
    outcome: v.string(),
    ipHash: v.optional(v.string()),
    userAgentHash: v.optional(v.string()),
    metadata: v.optional(v.any()),
    legacyPostgresId: legacyId,
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_ipHash", ["ipHash"])
    .index("by_person", ["personId"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  // ---------------------------------------------------------------------
  // Cells (Fase 3)
  // ---------------------------------------------------------------------

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
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_ministry", ["ministryId"])
    .index("by_network", ["networkId"])
    .index("by_responsiblePersonId", ["responsiblePersonId"])
    .index("by_status", ["status"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  cellMemberships: defineTable({
    cellId: v.id("cells"),
    personId: v.id("persons"),
    status: v.union(
      v.literal("active"),
      v.literal("left"),
      v.literal("transferred"),
    ),
    role: v.union(v.literal("member"), v.literal("twelve_team")),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    leaveReason: v.optional(v.string()),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_cell", ["cellId"])
    .index("by_person", ["personId"])
    .index("by_cell_person", ["cellId", "personId"])
    .index("by_person_status", ["personId", "status"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  cellAttendanceSessions: defineTable({
    cellId: v.id("cells"),
    /** YYYY-MM-DD — mirrors Drizzle `date` column (no time component). */
    sessionDate: v.string(),
    scheduledAt: v.optional(v.number()),
    status: v.union(
      v.literal("open"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    notes: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
    legacyPostgresId: legacyId,
    createdAt: v.number(),
  })
    .index("by_cell", ["cellId"])
    .index("by_cell_date", ["cellId", "sessionDate"])
    .index("by_sessionDate", ["sessionDate"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  cellAttendance: defineTable({
    sessionId: v.id("cellAttendanceSessions"),
    personId: v.id("persons"),
    membershipId: v.optional(v.id("cellMemberships")),
    status: v.union(
      v.literal("present"),
      v.literal("absent"),
      v.literal("excused"),
    ),
    notes: v.optional(v.string()),
    recordedByUserId: v.optional(v.id("users")),
    legacyPostgresId: legacyId,
    recordedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_person", ["sessionId", "personId"])
    .index("by_person", ["personId"])
    .index("by_status", ["status"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  // ---------------------------------------------------------------------
  // Leadership (Fase 4)
  // ---------------------------------------------------------------------

  /**
   * Pastoral leadership state — distinct from RBAC roles.
   * Active leaders MUST have primaryCellId pointing to their own active cell.
   */
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
    eligibleAt: v.optional(v.number()),
    eligibleByUserId: v.optional(v.id("users")),
    activatedAt: v.optional(v.number()),
    activatedByUserId: v.optional(v.id("users")),
    deactivatedAt: v.optional(v.number()),
    deactivatedByUserId: v.optional(v.id("users")),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_person", ["personId"])
    .index("by_status", ["status"])
    .index("by_ministry", ["ministryId"])
    .index("by_network", ["networkId"])
    .index("by_directLeader", ["directLeaderPersonId"])
    .index("by_primaryCell", ["primaryCellId"])
    .index("by_humanLeaderCode", ["humanLeaderCode"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /**
   * Closure table for efficient descendant / ancestor queries.
   * depth=0 is self. Maintained on activate / direct-leader changes.
   */
  leadershipClosure: defineTable({
    ancestorPersonId: v.id("persons"),
    descendantPersonId: v.id("persons"),
    depth: v.number(),
    ministryId: v.id("ministries"),
  })
    .index("by_ancestor_descendant", ["ancestorPersonId", "descendantPersonId"])
    .index("by_descendant", ["descendantPersonId"])
    .index("by_ministry", ["ministryId"])
    .index("by_ancestor_depth", ["ancestorPersonId", "depth"]),

  // ---------------------------------------------------------------------
  // Formation — pastoral process progress (Consolidar/UDV/Destino/EM/Enviar…)
  // ---------------------------------------------------------------------

  /**
   * Reusable pastoral progress — references persons only (no person duplication).
   * One row per (person, processType).
   */
  personProcessProgress: defineTable({
    personId: v.id("persons"),
    processType,
    stage: v.optional(v.string()),
    status: processStatus,
    currentStep: v.optional(v.string()),
    ministryId: v.id("ministries"),
    networkId: v.optional(v.id("networks")),
    assignedLeaderPersonId: v.optional(v.id("persons")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    completedByUserId: v.optional(v.id("users")),
    /** Safe non-PII progress metadata (no prayer requests / secrets). */
    metadata: v.optional(v.any()),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_person_processType", ["personId", "processType"])
    .index("by_person", ["personId"])
    .index("by_processType_status", ["processType", "status"])
    .index("by_ministry", ["ministryId"])
    .index("by_assignedLeader", ["assignedLeaderPersonId"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /** Append-only pastoral process events. */
  personProcessEvents: defineTable({
    progressId: v.id("personProcessProgress"),
    personId: v.id("persons"),
    processType,
    eventType: v.string(),
    fromStatus: v.optional(processStatus),
    toStatus: v.optional(processStatus),
    actorUserId: v.optional(v.id("users")),
    note: v.optional(v.string()),
    metadata: v.optional(v.any()),
    legacyPostgresId: legacyId,
    createdAt: v.number(),
  })
    .index("by_progress", ["progressId"])
    .index("by_person", ["personId"])
    .index("by_processType_eventType", ["processType", "eventType"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  // ---------------------------------------------------------------------
  // Formation — configurable training programs (UDV now; Destino/EM later)
  // ---------------------------------------------------------------------

  trainingPrograms: defineTable({
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    /** Optional sequential level within a family (e.g. Destino 1–3). */
    level: v.optional(v.number()),
    family: v.optional(v.string()),
    isActive: v.boolean(),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_family_level", ["family", "level"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  trainingModules: defineTable({
    programId: v.id("trainingPrograms"),
    code: v.string(),
    name: v.string(),
    /** doctrina | seminario | clase | evento | dia */
    componentCode: v.optional(v.string()),
    componentName: v.optional(v.string()),
    orderIndex: v.number(),
    isActive: v.boolean(),
    isRequired: v.boolean(),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_program_code", ["programId", "code"])
    .index("by_program_order", ["programId", "orderIndex"])
    .index("by_program_component", ["programId", "componentCode"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  trainingCycles: defineTable({
    programId: v.id("trainingPrograms"),
    name: v.string(),
    /** YYYY-MM-DD */
    startDate: v.string(),
    endDate: v.string(),
    status: v.union(
      v.literal("planned"),
      v.literal("active"),
      v.literal("closed"),
    ),
    ministryId: v.optional(v.id("ministries")),
    createdByUserId: v.optional(v.id("users")),
    activatedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_program", ["programId"])
    .index("by_status", ["status"])
    .index("by_ministry", ["ministryId"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  trainingEnrollments: defineTable({
    cycleId: v.id("trainingCycles"),
    personId: v.id("persons"),
    status: v.union(
      v.literal("enrolled"),
      v.literal("in_progress"),
      v.literal("academic_completed"),
      v.literal("completed"),
      v.literal("paused"),
    ),
    enrolledAt: v.number(),
    completedAt: v.optional(v.number()),
    completedByUserId: v.optional(v.id("users")),
    pausedAt: v.optional(v.number()),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_cycle_person", ["cycleId", "personId"])
    .index("by_person", ["personId"])
    .index("by_status", ["status"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /**
   * Module attendance. Historical absent rows are never deleted —
   * recovery updates status to recovered and records authorization.
   */
  trainingAttendance: defineTable({
    enrollmentId: v.id("trainingEnrollments"),
    moduleId: v.id("trainingModules"),
    /** YYYY-MM-DD */
    attendanceDate: v.string(),
    status: v.union(
      v.literal("present"),
      v.literal("absent"),
      v.literal("excused"),
      v.literal("recovered"),
    ),
    recordedByUserId: v.optional(v.id("users")),
    recordedAt: v.number(),
    recoveryAuthorizedByUserId: v.optional(v.id("users")),
    recoveryAuthorizedAt: v.optional(v.number()),
    recoveryNote: v.optional(v.string()),
    notes: v.optional(v.string()),
    legacyPostgresId: legacyId,
  })
    .index("by_enrollment_module", ["enrollmentId", "moduleId"])
    .index("by_enrollment", ["enrollmentId"])
    .index("by_module", ["moduleId"])
    .index("by_status", ["status"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /** Configurable completion requirements per program/level. */
  trainingCompletionRequirements: defineTable({
    programId: v.id("trainingPrograms"),
    requirementType: v.union(
      v.literal("modules_completed"),
      v.literal("attendance"),
      v.literal("active_cell_members"),
      v.literal("leadership_status"),
      v.literal("manual_approval"),
    ),
    numericValue: v.optional(v.number()),
    isRequired: v.boolean(),
    isActive: v.boolean(),
    /** academic | pastoral */
    category: v.string(),
    label: v.optional(v.string()),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_program", ["programId"])
    .index("by_type", ["requirementType"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /** Staff authorized on a cycle (teachers / coordinators). */
  trainingCycleStaff: defineTable({
    cycleId: v.id("trainingCycles"),
    userId: v.id("users"),
    role: v.union(
      v.literal("teacher"),
      v.literal("coordinator"),
      v.literal("assistant"),
    ),
    canTakeAttendance: v.boolean(),
    canAuthorizeRecovery: v.boolean(),
    canCompleteAcademic: v.boolean(),
    canCompleteLevel: v.boolean(),
    legacyPostgresId: legacyId,
    createdAt: v.number(),
  })
    .index("by_cycle_user", ["cycleId", "userId"])
    .index("by_user", ["userId"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /** Audited requirement overrides. */
  trainingRequirementOverrides: defineTable({
    personId: v.id("persons"),
    programId: v.id("trainingPrograms"),
    requirementId: v.optional(v.id("trainingCompletionRequirements")),
    reason: v.string(),
    actorUserId: v.id("users"),
    legacyPostgresId: legacyId,
    createdAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_program", ["programId"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  // ---------------------------------------------------------------------
  // Transfers — pastoral transfers, leadership/cell history (Fase 8)
  // ---------------------------------------------------------------------

  /**
   * Planned pastoral transfers — request → approval → execute.
   * Executed rows are immutable (idempotent guard).
   */
  pastoralTransferRequests: defineTable({
    personId: v.id("persons"),
    transferType: v.union(
      v.literal("network_change"),
      v.literal("ministry_change"),
      v.literal("cell_membership_transfer"),
      v.literal("direct_leader_change"),
      v.literal("subtree_move"),
      v.literal("cell_reassignment"),
      v.literal("leader_deactivation"),
    ),
    structureMode: v.union(
      v.literal("move_with_structure"),
      v.literal("move_person_only_and_reassign_structure"),
      v.literal("not_applicable"),
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("executed"),
      v.literal("cancelled"),
    ),
    requestedByUserId: v.id("users"),
    sourceMinistryId: v.optional(v.id("ministries")),
    sourceNetworkId: v.optional(v.id("networks")),
    destinationMinistryId: v.optional(v.id("ministries")),
    destinationNetworkId: v.optional(v.id("networks")),
    proposedDirectLeaderPersonId: v.optional(v.id("persons")),
    /** Target cell for membership / reassignment operations. */
    targetCellId: v.optional(v.id("cells")),
    reason: v.string(),
    /** Preview / plan payload (impact counts, reassignment map). */
    plan: v.optional(v.any()),
    approvedByUserId: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectedByUserId: v.optional(v.id("users")),
    rejectedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    executedByUserId: v.optional(v.id("users")),
    executedAt: v.optional(v.number()),
    cancelledByUserId: v.optional(v.id("users")),
    cancelledAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    legacyPostgresId: legacyId,
    ...timestamps,
  })
    .index("by_person", ["personId"])
    .index("by_status", ["status"])
    .index("by_type", ["transferType"])
    .index("by_sourceMinistry", ["sourceMinistryId"])
    .index("by_destinationMinistry", ["destinationMinistryId"])
    .index("by_requestedBy", ["requestedByUserId"])
    .index("by_approvedBy", ["approvedByUserId"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /** Historical direct-leader changes (closure is current-state only). */
  leadershipRelationshipHistory: defineTable({
    personId: v.id("persons"),
    oldDirectLeaderPersonId: v.optional(v.id("persons")),
    newDirectLeaderPersonId: v.optional(v.id("persons")),
    ministryId: v.optional(v.id("ministries")),
    reason: v.optional(v.string()),
    transferRequestId: v.optional(v.id("pastoralTransferRequests")),
    actorUserId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
    legacyPostgresId: legacyId,
    changedAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_changedAt", ["changedAt"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),

  /** Historical cell responsible changes. */
  cellLeadershipHistory: defineTable({
    cellId: v.id("cells"),
    oldResponsiblePersonId: v.optional(v.id("persons")),
    newResponsiblePersonId: v.optional(v.id("persons")),
    reason: v.optional(v.string()),
    transferRequestId: v.optional(v.id("pastoralTransferRequests")),
    actorUserId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
    legacyPostgresId: legacyId,
    changedAt: v.number(),
  })
    .index("by_cell", ["cellId"])
    .index("by_changedAt", ["changedAt"])
    .index("by_legacyPostgresId", ["legacyPostgresId"]),
});
