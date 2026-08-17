import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getCurrentOrgForPerson } from "./persons";

/**
 * Phase 9 — Executive/pastoral dashboard, reports, and integrity checks.
 * Mirrors `src/modules/reporting/*` (Drizzle/Postgres raw-SQL aggregations)
 * at MVP scope: bounded snapshot queries here, scope filtering + derived
 * math (periods, trends, funnels) in the Next.js layer — same pattern used
 * across `formation.ts` / `transfers.ts` / `send.ts`.
 */

const leadershipStatus = v.union(
  v.literal("none"),
  v.literal("eligible"),
  v.literal("active"),
  v.literal("inactive"),
);

// ---------------------------------------------------------------------
// Snapshots — bounded scans, scope/period filtering done by callers
// ---------------------------------------------------------------------

const personSnapshotRow = v.object({
  personId: v.id("persons"),
  firstName: v.string(),
  lastName: v.string(),
  source: v.union(v.literal("internal_form"), v.literal("public_form")),
  registeredAt: v.number(),
  hasPrayerRequest: v.boolean(),
  ministryId: v.optional(v.id("ministries")),
  networkId: v.optional(v.id("networks")),
  hasActiveCell: v.boolean(),
});

/** All active persons + current org + whether they hold an active cell membership. */
export const personsSnapshot = query({
  args: {},
  returns: v.array(personSnapshotRow),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("persons")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(20000);
    const active = rows.filter((p) => p.deletedAt === undefined);

    const results = [];
    for (const person of active) {
      const org = await getCurrentOrgForPerson(ctx, person._id);
      const membership = await ctx.db
        .query("cellMemberships")
        .withIndex("by_person_status", (q) => q.eq("personId", person._id).eq("status", "active"))
        .first();
      results.push({
        personId: person._id,
        firstName: person.firstName,
        lastName: person.lastName,
        source: person.source,
        registeredAt: person.registeredAt,
        hasPrayerRequest: Boolean(person.prayerRequest && person.prayerRequest.trim().length > 0),
        ministryId: org?.ministryId,
        networkId: org?.networkId,
        hasActiveCell: membership !== null,
      });
    }
    return results;
  },
});

const cellSnapshotRow = v.object({
  cellId: v.id("cells"),
  name: v.string(),
  type: v.union(v.literal("evangelistic"), v.literal("twelve")),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("closed")),
  ministryId: v.id("ministries"),
  networkId: v.id("networks"),
  responsiblePersonId: v.optional(v.id("persons")),
  createdAt: v.number(),
});

/** All cells (any status/ministry) — bounded scan for scope filtering + KPIs in the Next layer. */
export const cellsSnapshot = query({
  args: {},
  returns: v.array(cellSnapshotRow),
  handler: async (ctx) => {
    const rows = await ctx.db.query("cells").take(5000);
    return rows.map((c) => ({
      cellId: c._id,
      name: c.name,
      type: c.type,
      status: c.status,
      ministryId: c.ministryId,
      networkId: c.networkId,
      responsiblePersonId: c.responsiblePersonId,
      createdAt: c.createdAt,
    }));
  },
});

const leadershipSnapshotRow = v.object({
  personId: v.id("persons"),
  firstName: v.string(),
  lastName: v.string(),
  status: leadershipStatus,
  ministryId: v.id("ministries"),
  networkId: v.id("networks"),
  directLeaderPersonId: v.optional(v.id("persons")),
  humanLeaderCode: v.optional(v.string()),
  eligibleAt: v.optional(v.number()),
  activatedAt: v.optional(v.number()),
});

/** All `personLeadership` rows (any status) with display names — bounded scan. */
export const leadershipSnapshot = query({
  args: {},
  returns: v.array(leadershipSnapshotRow),
  handler: async (ctx) => {
    const rows = await ctx.db.query("personLeadership").take(10000);
    return await Promise.all(
      rows.map(async (l) => {
        const person = await ctx.db.get("persons", l.personId);
        return {
          personId: l.personId,
          firstName: person?.firstName ?? "",
          lastName: person?.lastName ?? "",
          status: l.status,
          ministryId: l.ministryId,
          networkId: l.networkId,
          directLeaderPersonId: l.directLeaderPersonId,
          humanLeaderCode: l.humanLeaderCode,
          eligibleAt: l.eligibleAt,
          activatedAt: l.activatedAt,
        };
      }),
    );
  },
});

const transferSnapshotRow = v.object({
  _id: v.id("pastoralTransferRequests"),
  personId: v.id("persons"),
  firstName: v.string(),
  lastName: v.string(),
  transferType: v.string(),
  status: v.string(),
  sourceMinistryId: v.optional(v.id("ministries")),
  destinationMinistryId: v.optional(v.id("ministries")),
  executedAt: v.optional(v.number()),
  rejectedAt: v.optional(v.number()),
  createdAt: v.number(),
});

/** All pastoral transfer requests with display names — bounded scan for dashboards/reports. */
export const transferRequestsSnapshot = query({
  args: {},
  returns: v.array(transferSnapshotRow),
  handler: async (ctx) => {
    const rows = await ctx.db.query("pastoralTransferRequests").take(5000);
    return await Promise.all(
      rows.map(async (r) => {
        const person = await ctx.db.get("persons", r.personId);
        return {
          _id: r._id,
          personId: r.personId,
          firstName: person?.firstName ?? "",
          lastName: person?.lastName ?? "",
          transferType: r.transferType,
          status: r.status,
          sourceMinistryId: r.sourceMinistryId,
          destinationMinistryId: r.destinationMinistryId,
          executedAt: r.executedAt,
          rejectedAt: r.rejectedAt,
          createdAt: r.createdAt,
        };
      }),
    );
  },
});

// ---------------------------------------------------------------------
// Cell attendance detail + trend (mirrors `metrics-cells.ts` `listCellAttendanceDetails`)
// ---------------------------------------------------------------------

const RECENT_SESSIONS = 2;
const BASELINE_SESSIONS = 4;
const DROP_RATIO = 0.7;

const cellAttendanceDetailRow = v.object({
  cellId: v.id("cells"),
  name: v.string(),
  type: v.union(v.literal("evangelistic"), v.literal("twelve")),
  lastSessionDate: v.union(v.string(), v.null()),
  lastPresent: v.union(v.number(), v.null()),
  activeMembers: v.number(),
  avgLast4Pct: v.union(v.number(), v.null()),
  trend: v.union(v.literal("up"), v.literal("stable"), v.literal("down"), v.literal("unknown")),
});

export const cellAttendanceDetails = query({
  args: { cellIds: v.array(v.id("cells")) },
  returns: v.array(cellAttendanceDetailRow),
  handler: async (ctx, args) => {
    const out: Array<{
      cellId: Id<"cells">;
      name: string;
      type: "evangelistic" | "twelve";
      lastSessionDate: string | null;
      lastPresent: number | null;
      activeMembers: number;
      avgLast4Pct: number | null;
      trend: "up" | "stable" | "down" | "unknown";
    }> = [];

    for (const cellId of args.cellIds) {
      const cell = await ctx.db.get("cells", cellId);
      if (!cell) continue;

      const memberships = await ctx.db
        .query("cellMemberships")
        .withIndex("by_cell", (q) => q.eq("cellId", cellId))
        .collect();
      const activeMembers = memberships.filter((m) => m.status === "active").length;

      const sessions = (
        await ctx.db
          .query("cellAttendanceSessions")
          .withIndex("by_cell", (q) => q.eq("cellId", cellId))
          .order("desc")
          .take(30)
      )
        .filter((s) => s.status === "completed" || s.status === "open")
        .slice(0, 6);

      const sessionStats: number[] = [];
      let lastPresent: number | null = null;
      for (const s of sessions) {
        const records = await ctx.db
          .query("cellAttendance")
          .withIndex("by_session", (q) => q.eq("sessionId", s._id))
          .collect();
        const present = records.filter((r) => r.status === "present").length;
        if (lastPresent === null) lastPresent = present;
        if (activeMembers > 0) sessionStats.push((present / activeMembers) * 100);
      }

      const recent = sessionStats.slice(0, RECENT_SESSIONS);
      const baseline = sessionStats.slice(RECENT_SESSIONS, RECENT_SESSIONS + BASELINE_SESSIONS);
      const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
      const recentAvg = avg(recent);
      const baseAvg = avg(baseline.length ? baseline : sessionStats.slice(RECENT_SESSIONS));
      const avgLast4 = avg(sessionStats.slice(0, 4));

      let trend: "up" | "stable" | "down" | "unknown" = "unknown";
      if (recentAvg != null && baseAvg != null && baseAvg > 0) {
        if (recentAvg < baseAvg * DROP_RATIO) trend = "down";
        else if (recentAvg > baseAvg * 1.1) trend = "up";
        else trend = "stable";
      }

      out.push({
        cellId,
        name: cell.name,
        type: cell.type,
        lastSessionDate: sessions[0]?.sessionDate ?? null,
        lastPresent,
        activeMembers,
        avgLast4Pct: avgLast4 != null ? Math.round(avgLast4 * 10) / 10 : null,
        trend,
      });
    }
    return out;
  },
});

// ---------------------------------------------------------------------
// Integrity checks — global, read-only, bounded (mirrors `integrity.ts`)
// ---------------------------------------------------------------------

/** Cell memberships in "twelve" cells with role=member but leader status != active. */
export const integrityTwelveOrdinaryMembers = query({
  args: {},
  returns: v.array(v.id("cellMemberships")),
  handler: async (ctx) => {
    const twelveCells = (await ctx.db.query("cells").take(5000)).filter((c) => c.type === "twelve");
    const violations: Id<"cellMemberships">[] = [];
    for (const cell of twelveCells) {
      const memberships = await ctx.db
        .query("cellMemberships")
        .withIndex("by_cell", (q) => q.eq("cellId", cell._id))
        .collect();
      for (const m of memberships) {
        if (m.status !== "active" || m.role !== "member") continue;
        const lead = await ctx.db
          .query("personLeadership")
          .withIndex("by_person", (q) => q.eq("personId", m.personId))
          .unique();
        if (lead?.status !== "active") violations.push(m._id);
        if (violations.length >= 50) return violations;
      }
    }
    return violations;
  },
});

/** `personId`s with more than one currently-open `personOrganizationHistory` row. */
export const integrityMultipleOpenOrgHistory = query({
  args: {},
  returns: v.array(v.id("persons")),
  handler: async (ctx) => {
    const rows = await ctx.db.query("personOrganizationHistory").take(20000);
    const openByPerson = new Map<Id<"persons">, number>();
    for (const r of rows) {
      if (r.effectiveTo === undefined) {
        openByPerson.set(r.personId, (openByPerson.get(r.personId) ?? 0) + 1);
      }
    }
    return [...openByPerson.entries()]
      .filter(([, c]) => c > 1)
      .map(([id]) => id)
      .slice(0, 50);
  },
});

/** Active leaders missing their depth-0 self row, or whose depth-1 parent edge doesn't match `directLeaderPersonId`. */
export const integrityClosureChecks = query({
  args: {},
  returns: v.object({
    missingSelfClosure: v.array(v.id("persons")),
    closureParentMismatch: v.array(v.id("persons")),
  }),
  handler: async (ctx) => {
    const leaders = (await ctx.db.query("personLeadership").take(10000)).filter(
      (l) => l.status === "active",
    );
    const missingSelfClosure: Id<"persons">[] = [];
    const closureParentMismatch: Id<"persons">[] = [];
    for (const l of leaders) {
      const self = await ctx.db
        .query("leadershipClosure")
        .withIndex("by_ancestor_descendant", (q) =>
          q.eq("ancestorPersonId", l.personId).eq("descendantPersonId", l.personId),
        )
        .unique();
      if (!self || self.depth !== 0) missingSelfClosure.push(l.personId);

      if (l.directLeaderPersonId) {
        const parentRow = await ctx.db
          .query("leadershipClosure")
          .withIndex("by_ancestor_descendant", (q) =>
            q.eq("ancestorPersonId", l.directLeaderPersonId!).eq("descendantPersonId", l.personId),
          )
          .unique();
        if (!parentRow || parentRow.depth !== 1) closureParentMismatch.push(l.personId);
      }
      if (missingSelfClosure.length >= 50 && closureParentMismatch.length >= 50) break;
    }
    return {
      missingSelfClosure: missingSelfClosure.slice(0, 50),
      closureParentMismatch: closureParentMismatch.slice(0, 50),
    };
  },
});

