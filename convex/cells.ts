import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { conflict, invalidArgument, notFound } from "./lib/errors";
import { now } from "./lib/time";

/**
 * Cells (Fase 3) domain module. Mirrors `src/modules/cells/service.ts`
 * (Drizzle/Postgres) at MVP scope — Célula de 12 conversion here only
 * flips `type`; leader-capacity/human-code rules live in `leadership.ts`.
 */

const dayOfWeek = v.union(
  v.literal("monday"),
  v.literal("tuesday"),
  v.literal("wednesday"),
  v.literal("thursday"),
  v.literal("friday"),
  v.literal("saturday"),
  v.literal("sunday"),
);

const cellType = v.union(v.literal("evangelistic"), v.literal("twelve"));
const cellStatus = v.union(v.literal("active"), v.literal("inactive"), v.literal("closed"));
const membershipStatus = v.union(
  v.literal("active"),
  v.literal("left"),
  v.literal("transferred"),
);
const membershipRole = v.union(v.literal("member"), v.literal("twelve_team"));
const attendanceStatus = v.union(
  v.literal("present"),
  v.literal("absent"),
  v.literal("excused"),
);
const networkCode = v.union(
  v.literal("hombres"),
  v.literal("mujeres"),
  v.literal("jovenes"),
  v.literal("ninos"),
);

/** Matches the `cells` table shape in `schema.ts`. */
export const cellDoc = v.object({
  _id: v.id("cells"),
  _creationTime: v.number(),
  code: v.optional(v.string()),
  name: v.string(),
  type: cellType,
  ministryId: v.id("ministries"),
  networkId: v.id("networks"),
  responsiblePersonId: v.optional(v.id("persons")),
  responsibleUserId: v.optional(v.id("users")),
  dayOfWeek: v.optional(dayOfWeek),
  startTime: v.optional(v.string()),
  timezone: v.string(),
  address: v.optional(v.string()),
  districtId: v.optional(v.id("districts")),
  status: cellStatus,
  openedAt: v.number(),
  closedAt: v.optional(v.number()),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** Matches the `cellMemberships` table shape in `schema.ts`. */
export const cellMembershipDoc = v.object({
  _id: v.id("cellMemberships"),
  _creationTime: v.number(),
  cellId: v.id("cells"),
  personId: v.id("persons"),
  status: membershipStatus,
  role: membershipRole,
  joinedAt: v.number(),
  leftAt: v.optional(v.number()),
  leaveReason: v.optional(v.string()),
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function assertResponsibleCapacity(
  ctx: MutationCtx,
  responsiblePersonId: Id<"persons">,
  cellType_: "evangelistic" | "twelve",
  excludeCellId?: Id<"cells">,
): Promise<void> {
  const rows = await ctx.db
    .query("cells")
    .withIndex("by_responsiblePersonId", (q) => q.eq("responsiblePersonId", responsiblePersonId))
    .collect();
  const active = rows.filter((c) => c.status !== "closed" && c._id !== excludeCellId);

  if (active.some((c) => c.type === cellType_)) {
    conflict("El responsable ya tiene una célula directa de este tipo.");
  }
  if (active.length >= 2) {
    conflict("El responsable ya alcanzó el máximo de dos células directas.");
  }
}

// ---------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------

export const create = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
    type: cellType,
    ministryId: v.id("ministries"),
    networkId: v.id("networks"),
    responsiblePersonId: v.optional(v.id("persons")),
    responsibleUserId: v.optional(v.id("users")),
    dayOfWeek: v.optional(dayOfWeek),
    startTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
    address: v.optional(v.string()),
    districtId: v.optional(v.id("districts")),
  },
  returns: cellDoc,
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) return invalidArgument("El nombre de la célula es obligatorio.");

    const ministry = await ctx.db.get("ministries", args.ministryId);
    if (!ministry || !ministry.isActive) return notFound("Ministerio no disponible.");

    const network = await ctx.db.get("networks", args.networkId);
    if (!network || !network.isActive || network.code === "ninos") {
      return invalidArgument("La Red seleccionada no está disponible para células.");
    }

    if (args.type === "twelve") {
      return invalidArgument(
        "La Célula de 12 se crea por conversión pastoral (cells.convertToTwelve), no por alta directa.",
      );
    }

    if (args.districtId) {
      const district = await ctx.db.get("districts", args.districtId);
      if (!district || !district.isActive) return notFound("Distrito no disponible.");
    }

    if (args.responsiblePersonId) {
      await assertResponsibleCapacity(ctx, args.responsiblePersonId, args.type);
    }

    const ts = now();
    const cellId = await ctx.db.insert("cells", {
      code: args.code?.trim() || undefined,
      name,
      type: args.type,
      ministryId: args.ministryId,
      networkId: args.networkId,
      responsiblePersonId: args.responsiblePersonId,
      responsibleUserId: args.responsibleUserId,
      dayOfWeek: args.dayOfWeek,
      startTime: args.startTime,
      timezone: args.timezone?.trim() || "America/Lima",
      address: args.address?.trim() || undefined,
      districtId: args.districtId,
      status: "active",
      openedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    });

    return (await ctx.db.get("cells", cellId))!;
  },
});

export const update = mutation({
  args: {
    cellId: v.id("cells"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    networkId: v.optional(v.id("networks")),
    responsiblePersonId: v.optional(v.id("persons")),
    dayOfWeek: v.optional(dayOfWeek),
    startTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
    address: v.optional(v.string()),
    districtId: v.optional(v.id("districts")),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  },
  returns: cellDoc,
  handler: async (ctx, args) => {
    const cell = await ctx.db.get("cells", args.cellId);
    if (!cell) return notFound("Célula no encontrada.");
    if (cell.status === "closed") return conflict("La célula está cerrada.");

    const patch: Record<string, unknown> = { updatedAt: now() };

    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      if (!trimmed) return invalidArgument("El nombre no puede estar vacío.");
      patch.name = trimmed;
    }
    if (args.code !== undefined) patch.code = args.code.trim() || undefined;
    if (args.networkId !== undefined) {
      const network = await ctx.db.get("networks", args.networkId);
      if (!network || !network.isActive || network.code === "ninos") {
        return invalidArgument("La Red seleccionada no está disponible.");
      }
      patch.networkId = args.networkId;
    }
    if (args.dayOfWeek !== undefined) patch.dayOfWeek = args.dayOfWeek;
    if (args.startTime !== undefined) patch.startTime = args.startTime;
    if (args.timezone !== undefined) patch.timezone = args.timezone.trim() || "America/Lima";
    if (args.address !== undefined) patch.address = args.address.trim() || undefined;
    if (args.districtId !== undefined) {
      if (args.districtId) {
        const district = await ctx.db.get("districts", args.districtId);
        if (!district || !district.isActive) return notFound("Distrito no disponible.");
      }
      patch.districtId = args.districtId;
    }
    if (args.status !== undefined) patch.status = args.status;
    if (args.responsiblePersonId !== undefined) {
      if (args.responsiblePersonId) {
        await assertResponsibleCapacity(ctx, args.responsiblePersonId, cell.type, cell._id);
      }
      patch.responsiblePersonId = args.responsiblePersonId;
    }

    await ctx.db.patch("cells", args.cellId, patch);
    return (await ctx.db.get("cells", args.cellId))!;
  },
});

export const close = mutation({
  args: { cellId: v.id("cells") },
  returns: cellDoc,
  handler: async (ctx, args) => {
    const cell = await ctx.db.get("cells", args.cellId);
    if (!cell) return notFound("Célula no encontrada.");
    if (cell.status === "closed") return cell;

    const memberships = await ctx.db
      .query("cellMemberships")
      .withIndex("by_cell", (q) => q.eq("cellId", args.cellId))
      .collect();
    const activeCount = memberships.filter((m) => m.status === "active").length;
    if (activeCount > 0) {
      return conflict(
        "No se puede cerrar la célula mientras tenga miembros activos. Reasigna o retira primero.",
      );
    }

    const ts = now();
    await ctx.db.patch("cells", args.cellId, { status: "closed", closedAt: ts, updatedAt: ts });
    return (await ctx.db.get("cells", args.cellId))!;
  },
});

/**
 * Converts an active evangelistic cell into a Célula de 12. MVP scope —
 * only flips `type`; existing memberships are left untouched (use
 * `reassignMember`/`removeMember` to relocate ordinary members and
 * `leadership.activate` to seed twelve_team membership).
 */
export const convertToTwelve = mutation({
  args: { cellId: v.id("cells") },
  returns: cellDoc,
  handler: async (ctx, args) => {
    const cell = await ctx.db.get("cells", args.cellId);
    if (!cell) return notFound("Célula no encontrada.");
    if (cell.type !== "evangelistic") {
      return conflict("Solo células evangelísticas pueden convertirse en Célula de 12.");
    }
    if (cell.status !== "active") return conflict("La célula debe estar activa para convertirse.");
    if (!cell.responsiblePersonId) {
      return conflict("La célula necesita un responsable antes de convertirse.");
    }

    const responsibleCells = await ctx.db
      .query("cells")
      .withIndex("by_responsiblePersonId", (q) =>
        q.eq("responsiblePersonId", cell.responsiblePersonId),
      )
      .collect();
    if (
      responsibleCells.some(
        (c) => c.type === "twelve" && c.status !== "closed" && c._id !== cell._id,
      )
    ) {
      return conflict("El responsable ya tiene una Célula de 12.");
    }

    await ctx.db.patch("cells", args.cellId, { type: "twelve", updatedAt: now() });
    return (await ctx.db.get("cells", args.cellId))!;
  },
});

export const addMember = mutation({
  args: {
    cellId: v.id("cells"),
    personId: v.id("persons"),
    role: v.optional(membershipRole),
  },
  returns: cellMembershipDoc,
  handler: async (ctx, args) => {
    const cell = await ctx.db.get("cells", args.cellId);
    if (!cell) return notFound("Célula no encontrada.");
    if (cell.status === "closed") return conflict("La célula está cerrada.");

    const person = await ctx.db.get("persons", args.personId);
    if (!person || person.deletedAt !== undefined) return notFound("Persona no encontrada.");

    const role = args.role ?? (cell.type === "twelve" ? "twelve_team" : "member");

    const activeMemberships = await ctx.db
      .query("cellMemberships")
      .withIndex("by_person_status", (q) => q.eq("personId", args.personId).eq("status", "active"))
      .collect();
    if (activeMemberships.some((m) => m.role === role)) {
      return conflict("La persona ya tiene una membresía activa de este tipo.");
    }

    const ts = now();
    const membershipId = await ctx.db.insert("cellMemberships", {
      cellId: args.cellId,
      personId: args.personId,
      status: "active",
      role,
      joinedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    });

    return (await ctx.db.get("cellMemberships", membershipId))!;
  },
});

export const getMembershipById = query({
  args: { membershipId: v.id("cellMemberships") },
  returns: v.union(cellMembershipDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("cellMemberships", args.membershipId);
  },
});

/** Present/total attendance counts for a batch of sessions. */
export const sessionAttendanceCounts = query({
  args: { sessionIds: v.array(v.id("cellAttendanceSessions")) },
  returns: v.array(
    v.object({ sessionId: v.id("cellAttendanceSessions"), present: v.number(), total: v.number() }),
  ),
  handler: async (ctx, args) => {
    const results = [];
    for (const sessionId of args.sessionIds) {
      const records = await ctx.db
        .query("cellAttendance")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect();
      results.push({
        sessionId,
        present: records.filter((r) => r.status === "present").length,
        total: records.length,
      });
    }
    return results;
  },
});

export const removeMember = mutation({
  args: { membershipId: v.id("cellMemberships"), reason: v.optional(v.string()) },
  returns: cellMembershipDoc,
  handler: async (ctx, args) => {
    const membership = await ctx.db.get("cellMemberships", args.membershipId);
    if (!membership || membership.status !== "active") {
      return notFound("Membresía no encontrada.");
    }

    const ts = now();
    await ctx.db.patch("cellMemberships", args.membershipId, {
      status: "left",
      leftAt: ts,
      leaveReason: args.reason?.trim() || undefined,
      updatedAt: ts,
    });

    return (await ctx.db.get("cellMemberships", args.membershipId))!;
  },
});

export const reassignMember = mutation({
  args: {
    membershipId: v.id("cellMemberships"),
    targetCellId: v.id("cells"),
    reason: v.optional(v.string()),
  },
  returns: cellMembershipDoc,
  handler: async (ctx, args) => {
    const membership = await ctx.db.get("cellMemberships", args.membershipId);
    if (!membership || membership.status !== "active") {
      return notFound("Membresía no encontrada.");
    }

    const target = await ctx.db.get("cells", args.targetCellId);
    if (!target) return notFound("Célula destino no encontrada.");
    if (target.status === "closed") return conflict("La célula destino está cerrada.");

    const ts = now();
    await ctx.db.patch("cellMemberships", args.membershipId, {
      status: "transferred",
      leftAt: ts,
      leaveReason: args.reason?.trim() || "Reasignación de célula",
      updatedAt: ts,
    });

    const newMembershipId = await ctx.db.insert("cellMemberships", {
      cellId: args.targetCellId,
      personId: membership.personId,
      status: "active",
      role: membership.role,
      joinedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    });

    return (await ctx.db.get("cellMemberships", newMembershipId))!;
  },
});

export const saveAttendance = mutation({
  args: {
    cellId: v.id("cells"),
    sessionDate: v.string(),
    notes: v.optional(v.string()),
    recordedByUserId: v.optional(v.id("users")),
    records: v.array(
      v.object({
        personId: v.id("persons"),
        membershipId: v.optional(v.id("cellMemberships")),
        status: attendanceStatus,
        notes: v.optional(v.string()),
      }),
    ),
  },
  returns: v.id("cellAttendanceSessions"),
  handler: async (ctx, args) => {
    const cell = await ctx.db.get("cells", args.cellId);
    if (!cell) return notFound("Célula no encontrada.");

    let session = await ctx.db
      .query("cellAttendanceSessions")
      .withIndex("by_cell_date", (q) =>
        q.eq("cellId", args.cellId).eq("sessionDate", args.sessionDate),
      )
      .unique();

    if (!session) {
      const sessionId = await ctx.db.insert("cellAttendanceSessions", {
        cellId: args.cellId,
        sessionDate: args.sessionDate,
        status: "open",
        notes: args.notes?.trim() || undefined,
        createdByUserId: args.recordedByUserId,
        createdAt: now(),
      });
      session = (await ctx.db.get("cellAttendanceSessions", sessionId))!;
    }

    for (const record of args.records) {
      const existing = await ctx.db
        .query("cellAttendance")
        .withIndex("by_session_person", (q) =>
          q.eq("sessionId", session!._id).eq("personId", record.personId),
        )
        .unique();

      if (existing) {
        await ctx.db.patch("cellAttendance", existing._id, {
          status: record.status,
          notes: record.notes?.trim() || undefined,
          membershipId: record.membershipId,
          recordedByUserId: args.recordedByUserId,
          recordedAt: now(),
        });
      } else {
        await ctx.db.insert("cellAttendance", {
          sessionId: session._id,
          personId: record.personId,
          membershipId: record.membershipId,
          status: record.status,
          notes: record.notes?.trim() || undefined,
          recordedByUserId: args.recordedByUserId,
          recordedAt: now(),
        });
      }
    }

    await ctx.db.patch("cellAttendanceSessions", session._id, {
      status: "completed",
      notes: args.notes?.trim() || session.notes,
    });

    return session._id;
  },
});

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

export const list = query({
  args: {
    ministryId: v.optional(v.id("ministries")),
    networkId: v.optional(v.id("networks")),
    status: v.optional(cellStatus),
    type: v.optional(cellType),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(cellDoc),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    let rows: Doc<"cells">[];
    if (args.ministryId) {
      rows = await ctx.db
        .query("cells")
        .withIndex("by_ministry", (q) => q.eq("ministryId", args.ministryId!))
        .collect();
    } else if (args.networkId) {
      rows = await ctx.db
        .query("cells")
        .withIndex("by_network", (q) => q.eq("networkId", args.networkId!))
        .collect();
    } else if (args.status) {
      rows = await ctx.db
        .query("cells")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      rows = await ctx.db.query("cells").collect();
    }

    let filtered = rows;
    if (args.ministryId && args.networkId) {
      filtered = filtered.filter((c) => c.networkId === args.networkId);
    }
    if (args.status) filtered = filtered.filter((c) => c.status === args.status);
    if (args.type) filtered = filtered.filter((c) => c.type === args.type);
    if (args.search?.trim()) {
      const needle = args.search.trim().toLowerCase();
      filtered = filtered.filter(
        (c) => c.name.toLowerCase().includes(needle) || (c.code?.toLowerCase().includes(needle) ?? false),
      );
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));
    return filtered.slice(0, limit);
  },
});

export const getDetail = query({
  args: { cellId: v.id("cells") },
  returns: v.union(
    v.object({
      cell: cellDoc,
      members: v.array(
        v.object({
          membershipId: v.id("cellMemberships"),
          personId: v.id("persons"),
          status: membershipStatus,
          role: membershipRole,
          joinedAt: v.number(),
          leftAt: v.optional(v.number()),
          firstName: v.string(),
          lastName: v.string(),
          phone: v.optional(v.string()),
        }),
      ),
      activeMemberCount: v.number(),
      recentSessions: v.array(
        v.object({
          _id: v.id("cellAttendanceSessions"),
          sessionDate: v.string(),
          status: v.union(v.literal("open"), v.literal("completed"), v.literal("cancelled")),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const cell = await ctx.db.get("cells", args.cellId);
    if (!cell) return null;

    const memberships = await ctx.db
      .query("cellMemberships")
      .withIndex("by_cell", (q) => q.eq("cellId", args.cellId))
      .collect();

    const members = await Promise.all(
      memberships.map(async (m) => {
        const person = await ctx.db.get("persons", m.personId);
        return {
          membershipId: m._id,
          personId: m.personId,
          status: m.status,
          role: m.role,
          joinedAt: m.joinedAt,
          leftAt: m.leftAt,
          firstName: person?.firstName ?? "",
          lastName: person?.lastName ?? "",
          phone: person?.phone,
        };
      }),
    );
    members.sort((a, b) => b.joinedAt - a.joinedAt);

    const sessions = await ctx.db
      .query("cellAttendanceSessions")
      .withIndex("by_cell", (q) => q.eq("cellId", args.cellId))
      .order("desc")
      .take(8);

    return {
      cell,
      members,
      activeMemberCount: members.filter((m) => m.status === "active").length,
      recentSessions: sessions.map((s) => ({
        _id: s._id,
        sessionDate: s.sessionDate,
        status: s.status,
      })),
    };
  },
});

export const getById = query({
  args: { cellId: v.id("cells") },
  returns: v.union(cellDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("cells", args.cellId);
  },
});

/** Every cell (any status) with `responsiblePersonId`. Used for capacity/compat checks. */
export const listByResponsible = query({
  args: { responsiblePersonId: v.id("persons") },
  returns: v.array(cellDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cells")
      .withIndex("by_responsiblePersonId", (q) => q.eq("responsiblePersonId", args.responsiblePersonId))
      .collect();
  },
});

/**
 * Full cell catalog (any status/ministry). Bounded scan — filtering, joins,
 * pagination and stats are computed in the Next layer
 * (`modules/cells/service.ts`), mirroring the MVP approach used elsewhere.
 */
export const listAll = query({
  args: {},
  returns: v.array(cellDoc),
  handler: async (ctx) => {
    return await ctx.db.query("cells").take(5000);
  },
});

/** Active `cellMemberships` count per requested cell. */
export const countActiveMembers = query({
  args: { cellIds: v.array(v.id("cells")) },
  returns: v.array(v.object({ cellId: v.id("cells"), count: v.number() })),
  handler: async (ctx, args) => {
    const counts = new Map<Id<"cells">, number>();
    for (const cellId of args.cellIds) {
      const memberships = await ctx.db
        .query("cellMemberships")
        .withIndex("by_cell", (q) => q.eq("cellId", cellId))
        .collect();
      counts.set(cellId, memberships.filter((m) => m.status === "active").length);
    }
    return [...counts.entries()].map(([cellId, count]) => ({ cellId, count }));
  },
});

/**
 * Average attendance % across the most recent sessions (default 20) among
 * the requested cells — mirrors the Drizzle `recentAttendanceAvg` KPI.
 */
export const recentAttendanceAvg = query({
  args: { cellIds: v.array(v.id("cells")), limit: v.optional(v.number()) },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const cellIdSet = new Set(args.cellIds);
    if (cellIdSet.size === 0) return null;
    const limit = args.limit ?? 20;

    const sessions = (
      await ctx.db.query("cellAttendanceSessions").withIndex("by_sessionDate").order("desc").take(1000)
    ).filter((s) => cellIdSet.has(s.cellId));

    const pcts: number[] = [];
    for (const session of sessions.slice(0, limit)) {
      const records = await ctx.db
        .query("cellAttendance")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();
      if (records.length === 0) continue;
      const present = records.filter((r) => r.status === "present").length;
      pcts.push((present / records.length) * 100);
    }

    if (pcts.length === 0) return null;
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  },
});

export const attendanceBoard = query({
  args: { cellId: v.id("cells"), sessionDate: v.string() },
  returns: v.object({
    cellId: v.id("cells"),
    activeMembers: v.array(
      v.object({
        membershipId: v.id("cellMemberships"),
        personId: v.id("persons"),
        firstName: v.string(),
        lastName: v.string(),
      }),
    ),
    sessionId: v.union(v.id("cellAttendanceSessions"), v.null()),
    sessionStatus: v.union(
      v.union(v.literal("open"), v.literal("completed"), v.literal("cancelled")),
      v.null(),
    ),
    attendance: v.array(
      v.object({ personId: v.id("persons"), status: attendanceStatus, notes: v.optional(v.string()) }),
    ),
  }),
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("cellMemberships")
      .withIndex("by_cell", (q) => q.eq("cellId", args.cellId))
      .collect();

    const activeMembers = await Promise.all(
      memberships
        .filter((m) => m.status === "active")
        .map(async (m) => {
          const person = await ctx.db.get("persons", m.personId);
          return {
            membershipId: m._id,
            personId: m.personId,
            firstName: person?.firstName ?? "",
            lastName: person?.lastName ?? "",
          };
        }),
    );

    const session = await ctx.db
      .query("cellAttendanceSessions")
      .withIndex("by_cell_date", (q) =>
        q.eq("cellId", args.cellId).eq("sessionDate", args.sessionDate),
      )
      .unique();

    let attendance: { personId: Id<"persons">; status: "present" | "absent" | "excused"; notes?: string }[] = [];
    if (session) {
      const records = await ctx.db
        .query("cellAttendance")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();
      attendance = records.map((r) => ({ personId: r.personId, status: r.status, notes: r.notes }));
    }

    return {
      cellId: args.cellId,
      activeMembers,
      sessionId: session?._id ?? null,
      sessionStatus: session?.status ?? null,
      attendance,
    };
  },
});

export const listCatalogs = query({
  args: {},
  returns: v.object({
    districts: v.array(v.object({ _id: v.id("districts"), name: v.string() })),
    networks: v.array(v.object({ _id: v.id("networks"), code: networkCode, name: v.string() })),
    ministries: v.array(v.object({ _id: v.id("ministries"), code: v.string(), name: v.string() })),
  }),
  handler: async (ctx) => {
    const [districts, networks, ministries] = await Promise.all([
      ctx.db
        .query("districts")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect(),
      ctx.db
        .query("networks")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect(),
      ctx.db
        .query("ministries")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect(),
    ]);

    return {
      districts: districts
        .map((d) => ({ _id: d._id, name: d.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      networks: networks
        .filter((n) => n.code !== "ninos")
        .map((n) => ({ _id: n._id, code: n.code, name: n.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      ministries: ministries
        .map((m) => ({ _id: m._id, code: m.code, name: m.name }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  },
});
