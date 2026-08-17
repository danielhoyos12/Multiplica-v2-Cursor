import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { DatabaseReader, MutationCtx } from "./_generated/server";
import { conflict, invalidArgument, notFound } from "./lib/errors";
import { now } from "./lib/time";

/**
 * Formation domain module (Consolidar / UDV / Capacitación Destino /
 * Escuela Ministerial / Re-Encuentro). All these flows reuse the same
 * `personProcessProgress` + `training*` tables (see `schema.ts`) —
 * business rules / gating / audit stay in `src/modules/formation/*`
 * (Next.js layer); this module owns generic persistence primitives.
 */

const processType = v.union(
  v.literal("consolidar"),
  v.literal("udv"),
  v.literal("destino"),
  v.literal("destino_n1"),
  v.literal("destino_n2"),
  v.literal("destino_n3"),
  v.literal("escuela_ministerial"),
  v.literal("reencuentro"),
  v.literal("pre_encuentro"),
  v.literal("encuentro"),
  v.literal("post_encuentro"),
  v.literal("em1"),
  v.literal("em2"),
  v.literal("em3"),
  v.literal("enviar"),
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

export const progressDoc = v.object({
  _id: v.id("personProcessProgress"),
  _creationTime: v.number(),
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
  metadata: v.optional(v.any()),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const programDoc = v.object({
  _id: v.id("trainingPrograms"),
  _creationTime: v.number(),
  code: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  level: v.optional(v.number()),
  family: v.optional(v.string()),
  isActive: v.boolean(),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const moduleDoc = v.object({
  _id: v.id("trainingModules"),
  _creationTime: v.number(),
  programId: v.id("trainingPrograms"),
  code: v.string(),
  name: v.string(),
  componentCode: v.optional(v.string()),
  componentName: v.optional(v.string()),
  orderIndex: v.number(),
  isActive: v.boolean(),
  isRequired: v.boolean(),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const cycleStatus = v.union(v.literal("planned"), v.literal("active"), v.literal("closed"));

export const cycleDoc = v.object({
  _id: v.id("trainingCycles"),
  _creationTime: v.number(),
  programId: v.id("trainingPrograms"),
  name: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  status: cycleStatus,
  ministryId: v.optional(v.id("ministries")),
  createdByUserId: v.optional(v.id("users")),
  activatedAt: v.optional(v.number()),
  closedAt: v.optional(v.number()),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const enrollmentStatus = v.union(
  v.literal("enrolled"),
  v.literal("in_progress"),
  v.literal("academic_completed"),
  v.literal("completed"),
  v.literal("paused"),
);

export const enrollmentDoc = v.object({
  _id: v.id("trainingEnrollments"),
  _creationTime: v.number(),
  cycleId: v.id("trainingCycles"),
  personId: v.id("persons"),
  status: enrollmentStatus,
  enrolledAt: v.number(),
  completedAt: v.optional(v.number()),
  completedByUserId: v.optional(v.id("users")),
  pausedAt: v.optional(v.number()),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const attendanceStatus = v.union(
  v.literal("present"),
  v.literal("absent"),
  v.literal("excused"),
  v.literal("recovered"),
);

export const attendanceDoc = v.object({
  _id: v.id("trainingAttendance"),
  _creationTime: v.number(),
  enrollmentId: v.id("trainingEnrollments"),
  moduleId: v.id("trainingModules"),
  attendanceDate: v.string(),
  status: attendanceStatus,
  recordedByUserId: v.optional(v.id("users")),
  recordedAt: v.number(),
  recoveryAuthorizedByUserId: v.optional(v.id("users")),
  recoveryAuthorizedAt: v.optional(v.number()),
  recoveryNote: v.optional(v.string()),
  notes: v.optional(v.string()),
  legacyPostgresId: v.optional(v.string()),
});

export const requirementDoc = v.object({
  _id: v.id("trainingCompletionRequirements"),
  _creationTime: v.number(),
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
  category: v.string(),
  label: v.optional(v.string()),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const cycleStaffRole = v.union(
  v.literal("teacher"),
  v.literal("coordinator"),
  v.literal("assistant"),
);

export const cycleStaffDoc = v.object({
  _id: v.id("trainingCycleStaff"),
  _creationTime: v.number(),
  cycleId: v.id("trainingCycles"),
  userId: v.id("users"),
  role: cycleStaffRole,
  canTakeAttendance: v.boolean(),
  canAuthorizeRecovery: v.boolean(),
  canCompleteAcademic: v.boolean(),
  canCompleteLevel: v.boolean(),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
});

export const overrideDoc = v.object({
  _id: v.id("trainingRequirementOverrides"),
  _creationTime: v.number(),
  personId: v.id("persons"),
  programId: v.id("trainingPrograms"),
  requirementId: v.optional(v.id("trainingCompletionRequirements")),
  reason: v.string(),
  actorUserId: v.id("users"),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
});

async function getProgressInternal(
  db: DatabaseReader,
  personId: Id<"persons">,
  type: Doc<"personProcessProgress">["processType"],
) {
  return await db
    .query("personProcessProgress")
    .withIndex("by_person_processType", (q) => q.eq("personId", personId).eq("processType", type))
    .unique();
}

// ---------------------------------------------------------------------
// Queries — progress
// ---------------------------------------------------------------------

export const getProgress = query({
  args: { personId: v.id("persons"), processType },
  returns: v.union(progressDoc, v.null()),
  handler: async (ctx, args) => getProgressInternal(ctx.db, args.personId, args.processType),
});

export const listProgressByPerson = query({
  args: { personId: v.id("persons") },
  returns: v.array(progressDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("personProcessProgress")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
  },
});

export const listProgressByPersons = query({
  args: { personIds: v.array(v.id("persons")) },
  returns: v.array(progressDoc),
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.personIds.map((personId) =>
        ctx.db
          .query("personProcessProgress")
          .withIndex("by_person", (q) => q.eq("personId", personId))
          .collect(),
      ),
    );
    return results.flat();
  },
});

export const countProgressByTypeStatus = query({
  args: {
    processTypes: v.array(processType),
    ministryIds: v.optional(v.array(v.id("ministries"))),
  },
  returns: v.array(v.object({ processType, status: processStatus, count: v.number() })),
  handler: async (ctx, args) => {
    const rowsByType = await Promise.all(
      args.processTypes.map((type) =>
        ctx.db
          .query("personProcessProgress")
          .withIndex("by_processType_status", (q) => q.eq("processType", type))
          .collect(),
      ),
    );
    const rows = rowsByType.flat().filter((r) => {
      if (!args.ministryIds || args.ministryIds.length === 0) return true;
      return args.ministryIds.includes(r.ministryId);
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.processType}:${r.status}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([key, count]) => {
      const [pt, status] = key.split(":");
      return { processType: pt as Doc<"personProcessProgress">["processType"], status: status as Doc<"personProcessProgress">["status"], count };
    });
  },
});

export const listProgressRows = query({
  args: {
    processTypes: v.optional(v.array(processType)),
    statuses: v.optional(v.array(processStatus)),
    ministryIds: v.optional(v.array(v.id("ministries"))),
    assignedLeaderPersonId: v.optional(v.id("persons")),
    personIds: v.optional(v.array(v.id("persons"))),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      progress: progressDoc,
      firstName: v.string(),
      lastName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    let rows: Doc<"personProcessProgress">[];
    if (args.personIds && args.personIds.length) {
      const perPerson = await Promise.all(
        args.personIds.map((personId) =>
          ctx.db
            .query("personProcessProgress")
            .withIndex("by_person", (q) => q.eq("personId", personId))
            .collect(),
        ),
      );
      rows = perPerson.flat();
    } else if (args.assignedLeaderPersonId) {
      rows = await ctx.db
        .query("personProcessProgress")
        .withIndex("by_assignedLeader", (q) =>
          q.eq("assignedLeaderPersonId", args.assignedLeaderPersonId),
        )
        .collect();
    } else if (args.ministryIds && args.ministryIds.length) {
      const perMinistry = await Promise.all(
        args.ministryIds.map((ministryId) =>
          ctx.db
            .query("personProcessProgress")
            .withIndex("by_ministry", (q) => q.eq("ministryId", ministryId))
            .collect(),
        ),
      );
      rows = perMinistry.flat();
    } else {
      rows = await ctx.db.query("personProcessProgress").collect();
    }

    if (args.processTypes?.length) {
      const set = new Set(args.processTypes);
      rows = rows.filter((r) => set.has(r.processType));
    }
    if (args.statuses?.length) {
      const set = new Set(args.statuses);
      rows = rows.filter((r) => set.has(r.status));
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    if (args.limit) rows = rows.slice(0, args.limit);

    const withNames = await Promise.all(
      rows.map(async (progress) => {
        const person = await ctx.db.get("persons", progress.personId);
        return { progress, firstName: person?.firstName ?? "", lastName: person?.lastName ?? "" };
      }),
    );
    return withNames;
  },
});

export const hasAssignedProgress = query({
  args: { personId: v.id("persons"), assignedLeaderPersonId: v.id("persons") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("personProcessProgress")
      .withIndex("by_assignedLeader", (q) =>
        q.eq("assignedLeaderPersonId", args.assignedLeaderPersonId),
      )
      .collect();
    return rows.some((r) => r.personId === args.personId);
  },
});

export const getDescendantPersonIds = query({
  args: { rootPersonId: v.id("persons") },
  returns: v.array(v.id("persons")),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("leadershipClosure")
      .withIndex("by_ancestor_depth", (q) => q.eq("ancestorPersonId", args.rootPersonId).gt("depth", 0))
      .collect();
    return rows.map((r) => r.descendantPersonId);
  },
});

export const isPersonInActiveCellUnder = query({
  args: { personId: v.id("persons"), responsiblePersonId: v.id("persons") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const ownCells = (
      await ctx.db
        .query("cells")
        .withIndex("by_responsiblePersonId", (q) => q.eq("responsiblePersonId", args.responsiblePersonId))
        .collect()
    ).filter((c) => c.status !== "closed");
    for (const cell of ownCells) {
      const membership = await ctx.db
        .query("cellMemberships")
        .withIndex("by_cell_person", (q) => q.eq("cellId", cell._id).eq("personId", args.personId))
        .collect();
      if (membership.some((m) => m.status === "active")) return true;
    }
    return false;
  },
});

export const countActiveCellMembers = query({
  args: { personId: v.id("persons") },
  returns: v.object({
    cellId: v.union(v.id("cells"), v.null()),
    count: v.number(),
    cellType: v.union(v.literal("evangelistic"), v.literal("twelve"), v.null()),
  }),
  handler: async (ctx, args) => {
    const ownCells = (
      await ctx.db
        .query("cells")
        .withIndex("by_responsiblePersonId", (q) => q.eq("responsiblePersonId", args.personId))
        .collect()
    ).filter((c) => c.status !== "closed");
    const evangelistic = ownCells.find((c) => c.type === "evangelistic" && c.status === "active");
    const cell = evangelistic ?? ownCells.find((c) => c.status === "active") ?? null;
    if (!cell) return { cellId: null, count: 0, cellType: null };
    const members = await ctx.db
      .query("cellMemberships")
      .withIndex("by_cell_person", (q) => q.eq("cellId", cell._id))
      .collect();
    const active = members.filter((m) => m.status === "active").length;
    return { cellId: cell._id, count: active, cellType: cell.type };
  },
});

// ---------------------------------------------------------------------
// Queries — programs / cycles / enrollments / attendance
// ---------------------------------------------------------------------

export const getProgramByCode = query({
  args: { code: v.string() },
  returns: v.union(programDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trainingPrograms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
  },
});

export const listProgramsByCodes = query({
  args: { codes: v.array(v.string()) },
  returns: v.array(programDoc),
  handler: async (ctx, args) => {
    const rows = await Promise.all(
      args.codes.map((code) =>
        ctx.db
          .query("trainingPrograms")
          .withIndex("by_code", (q) => q.eq("code", code))
          .unique(),
      ),
    );
    return rows.filter((r): r is Doc<"trainingPrograms"> => Boolean(r));
  },
});

export const listProgramsByFamily = query({
  args: { family: v.string() },
  returns: v.array(programDoc),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("trainingPrograms").collect();
    return rows.filter((r) => r.family === args.family);
  },
});

export const listModules = query({
  args: { programId: v.id("trainingPrograms"), activeOnly: v.optional(v.boolean()) },
  returns: v.array(moduleDoc),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("trainingModules")
      .withIndex("by_program_order", (q) => q.eq("programId", args.programId))
      .collect();
    const filtered = args.activeOnly ? rows.filter((m) => m.isActive) : rows;
    return filtered.sort((a, b) => a.orderIndex - b.orderIndex);
  },
});

export const listRequirements = query({
  args: { programId: v.id("trainingPrograms") },
  returns: v.array(requirementDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trainingCompletionRequirements")
      .withIndex("by_program", (q) => q.eq("programId", args.programId))
      .collect();
  },
});

export const listOverrides = query({
  args: { personId: v.id("persons"), programId: v.id("trainingPrograms") },
  returns: v.array(overrideDoc),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("trainingRequirementOverrides")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    return rows.filter((r) => r.programId === args.programId);
  },
});

export const getCycleStaff = query({
  args: { cycleId: v.id("trainingCycles"), userId: v.id("users") },
  returns: v.union(cycleStaffDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trainingCycleStaff")
      .withIndex("by_cycle_user", (q) => q.eq("cycleId", args.cycleId).eq("userId", args.userId))
      .unique();
  },
});

export const listCycles = query({
  args: { programIds: v.array(v.id("trainingPrograms")) },
  returns: v.array(cycleDoc),
  handler: async (ctx, args) => {
    const rows = await Promise.all(
      args.programIds.map((programId) =>
        ctx.db
          .query("trainingCycles")
          .withIndex("by_program", (q) => q.eq("programId", programId))
          .collect(),
      ),
    );
    return rows.flat().sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  },
});

export const getCycle = query({
  args: { cycleId: v.id("trainingCycles") },
  returns: v.union(cycleDoc, v.null()),
  handler: async (ctx, args) => await ctx.db.get("trainingCycles", args.cycleId),
});

export const listEnrollmentsByCycle = query({
  args: { cycleId: v.id("trainingCycles") },
  returns: v.array(
    v.object({ enrollment: enrollmentDoc, firstName: v.string(), lastName: v.string() }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("trainingEnrollments")
      .withIndex("by_cycle_person", (q) => q.eq("cycleId", args.cycleId))
      .collect();
    const withNames = await Promise.all(
      rows.map(async (enrollment) => {
        const person = await ctx.db.get("persons", enrollment.personId);
        return {
          enrollment,
          firstName: person?.firstName ?? "",
          lastName: person?.lastName ?? "",
        };
      }),
    );
    withNames.sort((a, b) => a.lastName.localeCompare(b.lastName));
    return withNames;
  },
});

export const getEnrollment = query({
  args: { enrollmentId: v.id("trainingEnrollments") },
  returns: v.union(enrollmentDoc, v.null()),
  handler: async (ctx, args) => await ctx.db.get("trainingEnrollments", args.enrollmentId),
});

export const getEnrollmentByCycleAndPerson = query({
  args: { cycleId: v.id("trainingCycles"), personId: v.id("persons") },
  returns: v.union(enrollmentDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trainingEnrollments")
      .withIndex("by_cycle_person", (q) => q.eq("cycleId", args.cycleId).eq("personId", args.personId))
      .unique();
  },
});

export const listAttendanceByEnrollments = query({
  args: { enrollmentIds: v.array(v.id("trainingEnrollments")) },
  returns: v.array(attendanceDoc),
  handler: async (ctx, args) => {
    const rows = await Promise.all(
      args.enrollmentIds.map((enrollmentId) =>
        ctx.db
          .query("trainingAttendance")
          .withIndex("by_enrollment", (q) => q.eq("enrollmentId", enrollmentId))
          .collect(),
      ),
    );
    return rows.flat();
  },
});

export const getAttendance = query({
  args: { enrollmentId: v.id("trainingEnrollments"), moduleId: v.id("trainingModules") },
  returns: v.union(attendanceDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trainingAttendance")
      .withIndex("by_enrollment_module", (q) =>
        q.eq("enrollmentId", args.enrollmentId).eq("moduleId", args.moduleId),
      )
      .unique();
  },
});

// ---------------------------------------------------------------------
// Mutations — progress
// ---------------------------------------------------------------------

export const upsertProgress = mutation({
  args: {
    personId: v.id("persons"),
    processType,
    status: processStatus,
    stage: v.optional(v.string()),
    currentStep: v.optional(v.string()),
    ministryId: v.optional(v.id("ministries")),
    networkId: v.optional(v.id("networks")),
    assignedLeaderPersonId: v.optional(v.id("persons")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    completedByUserId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
  },
  returns: progressDoc,
  handler: async (ctx, args) => {
    const existing = await getProgressInternal(ctx.db, args.personId, args.processType);
    const ts = now();
    if (existing) {
      const patch: Record<string, unknown> = { status: args.status, updatedAt: ts };
      if (args.stage !== undefined) patch.stage = args.stage;
      if (args.currentStep !== undefined) patch.currentStep = args.currentStep;
      if (args.networkId !== undefined) patch.networkId = args.networkId;
      if (args.assignedLeaderPersonId !== undefined) patch.assignedLeaderPersonId = args.assignedLeaderPersonId;
      if (args.startedAt !== undefined) patch.startedAt = args.startedAt;
      if (args.completedAt !== undefined) patch.completedAt = args.completedAt;
      if (args.completedByUserId !== undefined) patch.completedByUserId = args.completedByUserId;
      if (args.metadata !== undefined) patch.metadata = args.metadata;
      await ctx.db.patch("personProcessProgress", existing._id, patch);
      return (await ctx.db.get("personProcessProgress", existing._id))!;
    }
    if (!args.ministryId) return invalidArgument("ministryId es requerido para crear progreso.");
    const id = await ctx.db.insert("personProcessProgress", {
      personId: args.personId,
      processType: args.processType,
      status: args.status,
      stage: args.stage,
      currentStep: args.currentStep,
      ministryId: args.ministryId,
      networkId: args.networkId,
      assignedLeaderPersonId: args.assignedLeaderPersonId,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      completedByUserId: args.completedByUserId,
      metadata: args.metadata ?? {},
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("personProcessProgress", id))!;
  },
});

export const appendProcessEvent = mutation({
  args: {
    progressId: v.id("personProcessProgress"),
    personId: v.id("persons"),
    processType,
    eventType: v.string(),
    fromStatus: v.optional(processStatus),
    toStatus: v.optional(processStatus),
    actorUserId: v.optional(v.id("users")),
    note: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("personProcessEvents"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("personProcessEvents", {
      progressId: args.progressId,
      personId: args.personId,
      processType: args.processType,
      eventType: args.eventType,
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      actorUserId: args.actorUserId,
      note: args.note,
      metadata: args.metadata ?? {},
      createdAt: now(),
    });
  },
});

// ---------------------------------------------------------------------
// Mutations — programs / modules / requirements / catalog seed
// ---------------------------------------------------------------------

async function ensureProgramInternal(
  ctx: MutationCtx,
  args: {
    code: string;
    name: string;
    description?: string;
    family?: string;
    level?: number | null;
  },
) {
  const existing = await ctx.db
    .query("trainingPrograms")
    .withIndex("by_code", (q) => q.eq("code", args.code))
    .unique();
  const ts = now();
  if (!existing) {
    const id = await ctx.db.insert("trainingPrograms", {
      code: args.code,
      name: args.name,
      description: args.description,
      family: args.family,
      level: args.level ?? undefined,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("trainingPrograms", id))!;
  }
  const needsUpdate =
    existing.name !== args.name ||
    (args.family !== undefined && existing.family !== args.family) ||
    (args.level !== undefined && existing.level !== (args.level ?? undefined));
  if (needsUpdate) {
    await ctx.db.patch("trainingPrograms", existing._id, {
      name: args.name,
      family: args.family ?? existing.family,
      level: args.level === undefined ? existing.level : args.level ?? undefined,
      isActive: true,
      updatedAt: ts,
    });
    return (await ctx.db.get("trainingPrograms", existing._id))!;
  }
  return existing;
}

export const ensureProgram = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    family: v.optional(v.string()),
    level: v.optional(v.number()),
  },
  returns: programDoc,
  handler: async (ctx, args) => ensureProgramInternal(ctx, args),
});

async function syncModulesInternal(
  ctx: MutationCtx,
  programId: Id<"trainingPrograms">,
  defs: Array<{
    code: string;
    name: string;
    orderIndex: number;
    componentCode?: string | null;
    componentName?: string | null;
    isRequired?: boolean;
  }>,
  deactivateMissing = false,
) {
  const existing = await ctx.db
    .query("trainingModules")
    .withIndex("by_program_code", (q) => q.eq("programId", programId))
    .collect();
  const byCode = new Map(existing.map((m) => [m.code, m]));
  const ts = now();

  for (const def of defs) {
    const row = byCode.get(def.code);
    if (!row) {
      await ctx.db.insert("trainingModules", {
        programId,
        code: def.code,
        name: def.name,
        orderIndex: def.orderIndex,
        componentCode: def.componentCode ?? undefined,
        componentName: def.componentName ?? undefined,
        isActive: true,
        isRequired: def.isRequired ?? true,
        createdAt: ts,
        updatedAt: ts,
      });
    } else if (
      row.componentCode !== (def.componentCode ?? undefined) ||
      row.componentName !== (def.componentName ?? undefined) ||
      row.name !== def.name ||
      !row.isActive
    ) {
      await ctx.db.patch("trainingModules", row._id, {
        name: def.name,
        componentCode: def.componentCode ?? undefined,
        componentName: def.componentName ?? undefined,
        orderIndex: def.orderIndex,
        isActive: true,
        updatedAt: ts,
      });
    }
  }

  if (deactivateMissing) {
    const seedCodes = new Set(defs.map((d) => d.code));
    for (const row of existing) {
      if (!seedCodes.has(row.code) && row.isActive) {
        await ctx.db.patch("trainingModules", row._id, {
          isActive: false,
          name: `${row.name} [legacy inactive]`,
          updatedAt: ts,
        });
      }
    }
  }
}

export const syncModules = mutation({
  args: {
    programId: v.id("trainingPrograms"),
    modules: v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        orderIndex: v.number(),
        componentCode: v.optional(v.string()),
        componentName: v.optional(v.string()),
        isRequired: v.optional(v.boolean()),
      }),
    ),
    deactivateMissing: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await syncModulesInternal(ctx, args.programId, args.modules, args.deactivateMissing ?? false);
    return null;
  },
});

export const syncRequirements = mutation({
  args: {
    programId: v.id("trainingPrograms"),
    requirements: v.array(
      v.object({
        requirementType: v.union(
          v.literal("modules_completed"),
          v.literal("attendance"),
          v.literal("active_cell_members"),
          v.literal("leadership_status"),
          v.literal("manual_approval"),
        ),
        numericValue: v.optional(v.number()),
        category: v.string(),
        label: v.optional(v.string()),
        isRequired: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trainingCompletionRequirements")
      .withIndex("by_program", (q) => q.eq("programId", args.programId))
      .collect();
    if (existing.length > 0) return null;
    const ts = now();
    for (const req of args.requirements) {
      await ctx.db.insert("trainingCompletionRequirements", {
        programId: args.programId,
        requirementType: req.requirementType,
        numericValue: req.numericValue,
        category: req.category,
        label: req.label,
        isRequired: req.isRequired ?? true,
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      });
    }
    return null;
  },
});

export const deactivateRequirementType = mutation({
  args: {
    programId: v.id("trainingPrograms"),
    requirementType: v.union(
      v.literal("modules_completed"),
      v.literal("attendance"),
      v.literal("active_cell_members"),
      v.literal("leadership_status"),
      v.literal("manual_approval"),
    ),
    labelSuffix: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("trainingCompletionRequirements")
      .withIndex("by_program", (q) => q.eq("programId", args.programId))
      .collect();
    const ts = now();
    for (const row of rows) {
      if (row.requirementType === args.requirementType && row.isActive) {
        await ctx.db.patch("trainingCompletionRequirements", row._id, {
          isActive: false,
          label: `${row.label ?? args.requirementType}${args.labelSuffix ?? " (desactivado)"}`,
          updatedAt: ts,
        });
      }
    }
    return null;
  },
});

export const ensureAcademicRequirement = mutation({
  args: { programId: v.id("trainingPrograms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("trainingCompletionRequirements")
      .withIndex("by_program", (q) => q.eq("programId", args.programId))
      .collect();
    const hasAcademic = rows.some(
      (r) => r.isActive && (r.requirementType === "manual_approval" || r.category === "academic"),
    );
    if (!hasAcademic) {
      const ts = now();
      await ctx.db.insert("trainingCompletionRequirements", {
        programId: args.programId,
        requirementType: "manual_approval",
        category: "academic",
        label: "Componente académico aprobado",
        isRequired: true,
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      });
    }
    return null;
  },
});

/** Idempotent official catalog seed — mirrors `official-catalog.ts` `ensureOfficialCatalog`. */
export const seedOfficialCatalog = mutation({
  args: {
    seeds: v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        family: v.string(),
        level: v.optional(v.number()),
        academicRequirement: v.optional(v.boolean()),
        modules: v.array(
          v.object({
            code: v.string(),
            name: v.string(),
            orderIndex: v.number(),
            componentCode: v.optional(v.string()),
            componentName: v.optional(v.string()),
          }),
        ),
      }),
    ),
    legacyCodes: v.array(v.string()),
    realignFamilyFrom: v.optional(v.string()),
    realignFamilyTo: v.optional(v.string()),
  },
  returns: v.array(programDoc),
  handler: async (ctx, args) => {
    const results: Doc<"trainingPrograms">[] = [];
    for (const seed of args.seeds) {
      const program = await ensureProgramInternal(ctx, {
        code: seed.code,
        name: seed.name,
        family: seed.family,
        level: seed.level ?? null,
      });
      await syncModulesInternal(ctx, program._id, seed.modules, true);

      if (seed.academicRequirement) {
        const reqs = await ctx.db
          .query("trainingCompletionRequirements")
          .withIndex("by_program", (q) => q.eq("programId", program._id))
          .collect();
        const ts = now();
        for (const req of reqs) {
          if (req.requirementType === "active_cell_members" && req.isActive) {
            await ctx.db.patch("trainingCompletionRequirements", req._id, {
              isActive: false,
              label: `${req.label ?? "12 personas"} (desactivado — no confirmado por nivel)`,
              updatedAt: ts,
            });
          }
        }
        const hasAcademic = reqs.some(
          (r) => r.isActive && (r.requirementType === "manual_approval" || r.category === "academic"),
        );
        if (!hasAcademic) {
          await ctx.db.insert("trainingCompletionRequirements", {
            programId: program._id,
            requirementType: "manual_approval",
            category: "academic",
            label: "Componente académico aprobado",
            isRequired: true,
            isActive: true,
            createdAt: ts,
            updatedAt: ts,
          });
        }
      }
      results.push(program);
    }

    const ts = now();
    for (const legacyCode of args.legacyCodes) {
      const row = await ctx.db
        .query("trainingPrograms")
        .withIndex("by_code", (q) => q.eq("code", legacyCode))
        .unique();
      if (row && row.isActive) {
        await ctx.db.patch("trainingPrograms", row._id, {
          isActive: false,
          description: `${row.description ?? ""} [DEPRECATED — Phase 7 reconciliation]`.trim(),
          updatedAt: ts,
        });
      }
    }

    if (args.realignFamilyFrom && args.realignFamilyTo) {
      const all = await ctx.db.query("trainingPrograms").collect();
      for (const row of all) {
        if (row.family === args.realignFamilyFrom) {
          await ctx.db.patch("trainingPrograms", row._id, {
            family: args.realignFamilyTo,
            updatedAt: ts,
          });
        }
      }
    }

    return results;
  },
});

// ---------------------------------------------------------------------
// Mutations — cycles / enrollments / attendance / staff / overrides
// ---------------------------------------------------------------------

export const createCycle = mutation({
  args: {
    programId: v.id("trainingPrograms"),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    ministryId: v.optional(v.id("ministries")),
    createdByUserId: v.optional(v.id("users")),
  },
  returns: cycleDoc,
  handler: async (ctx, args) => {
    const ts = now();
    const id = await ctx.db.insert("trainingCycles", {
      programId: args.programId,
      name: args.name,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "planned",
      ministryId: args.ministryId,
      createdByUserId: args.createdByUserId,
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("trainingCycles", id))!;
  },
});

export const activateCycle = mutation({
  args: { cycleId: v.id("trainingCycles") },
  returns: cycleDoc,
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get("trainingCycles", args.cycleId);
    if (!cycle) return notFound("Ciclo no encontrado.");
    if (cycle.status === "active") return conflict("El ciclo ya está activo.");
    if (cycle.status === "closed") return conflict("El ciclo está cerrado.");
    const ts = now();
    await ctx.db.patch("trainingCycles", args.cycleId, { status: "active", activatedAt: ts, updatedAt: ts });
    return (await ctx.db.get("trainingCycles", args.cycleId))!;
  },
});

export const closeCycle = mutation({
  args: { cycleId: v.id("trainingCycles") },
  returns: cycleDoc,
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get("trainingCycles", args.cycleId);
    if (!cycle) return notFound("Ciclo no encontrado.");
    if (cycle.status === "closed") return conflict("El ciclo ya está cerrado.");
    const ts = now();
    await ctx.db.patch("trainingCycles", args.cycleId, { status: "closed", closedAt: ts, updatedAt: ts });
    return (await ctx.db.get("trainingCycles", args.cycleId))!;
  },
});

export const enroll = mutation({
  args: {
    cycleId: v.id("trainingCycles"),
    personId: v.id("persons"),
    status: v.optional(enrollmentStatus),
  },
  returns: enrollmentDoc,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trainingEnrollments")
      .withIndex("by_cycle_person", (q) => q.eq("cycleId", args.cycleId).eq("personId", args.personId))
      .unique();
    if (existing) return conflict("Ya inscrito en este ciclo.");
    const ts = now();
    const id = await ctx.db.insert("trainingEnrollments", {
      cycleId: args.cycleId,
      personId: args.personId,
      status: args.status ?? "in_progress",
      enrolledAt: ts,
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("trainingEnrollments", id))!;
  },
});

export const updateEnrollmentStatus = mutation({
  args: {
    enrollmentId: v.id("trainingEnrollments"),
    status: enrollmentStatus,
    completedByUserId: v.optional(v.id("users")),
  },
  returns: enrollmentDoc,
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("trainingEnrollments", args.enrollmentId);
    if (!existing) return notFound("Inscripción no encontrada.");
    const ts = now();
    const patch: Record<string, unknown> = { status: args.status, updatedAt: ts };
    if (args.status === "completed") {
      patch.completedAt = ts;
      if (args.completedByUserId) patch.completedByUserId = args.completedByUserId;
    }
    await ctx.db.patch("trainingEnrollments", args.enrollmentId, patch);
    return (await ctx.db.get("trainingEnrollments", args.enrollmentId))!;
  },
});

export const bulkCompleteEnrollmentsForPerson = mutation({
  args: {
    personId: v.id("persons"),
    cycleIds: v.optional(v.array(v.id("trainingCycles"))),
    completedByUserId: v.optional(v.id("users")),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("trainingEnrollments")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const cycleSet = args.cycleIds ? new Set(args.cycleIds) : null;
    const open = rows.filter(
      (r) =>
        ["enrolled", "in_progress", "academic_completed"].includes(r.status) &&
        (!cycleSet || cycleSet.has(r.cycleId)),
    );
    const ts = now();
    for (const row of open) {
      await ctx.db.patch("trainingEnrollments", row._id, {
        status: "completed",
        completedAt: ts,
        completedByUserId: args.completedByUserId,
        updatedAt: ts,
      });
    }
    return open.length;
  },
});

export const recordAttendance = mutation({
  args: {
    enrollmentId: v.id("trainingEnrollments"),
    moduleId: v.id("trainingModules"),
    attendanceDate: v.string(),
    status: attendanceStatus,
    recordedByUserId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  },
  returns: attendanceDoc,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trainingAttendance")
      .withIndex("by_enrollment_module", (q) =>
        q.eq("enrollmentId", args.enrollmentId).eq("moduleId", args.moduleId),
      )
      .unique();
    const ts = now();
    if (existing) {
      await ctx.db.patch("trainingAttendance", existing._id, {
        status: args.status,
        attendanceDate: args.attendanceDate,
        recordedByUserId: args.recordedByUserId,
        recordedAt: ts,
        notes: args.notes ?? existing.notes,
      });
      return (await ctx.db.get("trainingAttendance", existing._id))!;
    }
    const id = await ctx.db.insert("trainingAttendance", {
      enrollmentId: args.enrollmentId,
      moduleId: args.moduleId,
      attendanceDate: args.attendanceDate,
      status: args.status,
      recordedByUserId: args.recordedByUserId,
      recordedAt: ts,
      notes: args.notes,
    });
    return (await ctx.db.get("trainingAttendance", id))!;
  },
});

export const authorizeRecovery = mutation({
  args: {
    attendanceId: v.id("trainingAttendance"),
    actorUserId: v.id("users"),
    note: v.optional(v.string()),
  },
  returns: attendanceDoc,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("trainingAttendance", args.attendanceId);
    if (!row) return notFound("Asistencia no encontrada.");
    if (row.status !== "absent" && row.status !== "excused") {
      return conflict("Solo se recuperan ausencias o justificados.");
    }
    const ts = now();
    await ctx.db.patch("trainingAttendance", args.attendanceId, {
      status: "recovered",
      recoveryAuthorizedByUserId: args.actorUserId,
      recoveryAuthorizedAt: ts,
      recoveryNote: args.note?.trim() || undefined,
      recordedAt: ts,
    });
    return (await ctx.db.get("trainingAttendance", args.attendanceId))!;
  },
});

export const assignCycleStaff = mutation({
  args: {
    cycleId: v.id("trainingCycles"),
    userId: v.id("users"),
    role: v.optional(cycleStaffRole),
    canTakeAttendance: v.optional(v.boolean()),
    canAuthorizeRecovery: v.optional(v.boolean()),
    canCompleteAcademic: v.optional(v.boolean()),
    canCompleteLevel: v.optional(v.boolean()),
  },
  returns: cycleStaffDoc,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trainingCycleStaff")
      .withIndex("by_cycle_user", (q) => q.eq("cycleId", args.cycleId).eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch("trainingCycleStaff", existing._id, {
        role: args.role ?? existing.role,
        canTakeAttendance: args.canTakeAttendance ?? existing.canTakeAttendance,
        canAuthorizeRecovery: args.canAuthorizeRecovery ?? existing.canAuthorizeRecovery,
        canCompleteAcademic: args.canCompleteAcademic ?? existing.canCompleteAcademic,
        canCompleteLevel: args.canCompleteLevel ?? existing.canCompleteLevel,
      });
      return (await ctx.db.get("trainingCycleStaff", existing._id))!;
    }
    const id = await ctx.db.insert("trainingCycleStaff", {
      cycleId: args.cycleId,
      userId: args.userId,
      role: args.role ?? "teacher",
      canTakeAttendance: args.canTakeAttendance ?? false,
      canAuthorizeRecovery: args.canAuthorizeRecovery ?? false,
      canCompleteAcademic: args.canCompleteAcademic ?? false,
      canCompleteLevel: args.canCompleteLevel ?? false,
      createdAt: now(),
    });
    return (await ctx.db.get("trainingCycleStaff", id))!;
  },
});

export const insertOverride = mutation({
  args: {
    personId: v.id("persons"),
    programId: v.id("trainingPrograms"),
    requirementId: v.optional(v.id("trainingCompletionRequirements")),
    reason: v.string(),
    actorUserId: v.id("users"),
  },
  returns: v.id("trainingRequirementOverrides"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("trainingRequirementOverrides", {
      personId: args.personId,
      programId: args.programId,
      requirementId: args.requirementId,
      reason: args.reason,
      actorUserId: args.actorUserId,
      createdAt: now(),
    });
  },
});
