import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { now } from "./lib/time";

/**
 * Phase 8 — "Enviar" (Send) workflow. EM3 completed → eligible →
 * in_progress → completed. Mirrors `src/modules/send/service.ts`
 * (Drizzle/Postgres). Never activates leadership / creates cells here —
 * `markEligible`/`activate` stay Phase-4 concerns (`leadership.ts`).
 */

const PROCESS = "enviar" as const;

const progressStatus = v.union(
  v.literal("pending"),
  v.literal("eligible"),
  v.literal("in_progress"),
  v.literal("academic_completed"),
  v.literal("completed"),
  v.literal("paused"),
  v.literal("abandoned"),
);

export const sendProgressDoc = v.object({
  _id: v.id("personProcessProgress"),
  _creationTime: v.number(),
  personId: v.id("persons"),
  status: progressStatus,
  stage: v.optional(v.string()),
  currentStep: v.optional(v.string()),
  ministryId: v.id("ministries"),
  networkId: v.optional(v.id("networks")),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  completedByUserId: v.optional(v.id("users")),
  metadata: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function getSendProgressInternal(db: QueryCtx["db"], personId: Id<"persons">) {
  return await db
    .query("personProcessProgress")
    .withIndex("by_person_processType", (q) =>
      q.eq("personId", personId).eq("processType", PROCESS),
    )
    .unique();
}

async function getEm3StatusInternal(db: QueryCtx["db"], personId: Id<"persons">) {
  const row = await db
    .query("personProcessProgress")
    .withIndex("by_person_processType", (q) =>
      q.eq("personId", personId).eq("processType", "em3"),
    )
    .unique();
  return row?.status ?? null;
}

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

export const getProgress = query({
  args: { personId: v.id("persons") },
  returns: v.union(sendProgressDoc, v.null()),
  handler: async (ctx, args) => getSendProgressInternal(ctx.db, args.personId),
});

export const getEm3Status = query({
  args: { personId: v.id("persons") },
  returns: v.union(progressStatus, v.null()),
  handler: async (ctx, args) => getEm3StatusInternal(ctx.db, args.personId),
});

export const listSendPeople = query({
  args: {
    status: v.optional(progressStatus),
    ministryIds: v.optional(v.array(v.id("ministries"))),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      progress: sendProgressDoc,
      firstName: v.string(),
      lastName: v.string(),
      leadershipStatus: v.union(
        v.literal("none"),
        v.literal("eligible"),
        v.literal("active"),
        v.literal("inactive"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    let rows: Doc<"personProcessProgress">[] = await ctx.db
      .query("personProcessProgress")
      .withIndex("by_processType_status", (q) =>
        args.status ? q.eq("processType", PROCESS).eq("status", args.status) : q.eq("processType", PROCESS),
      )
      .collect();
    if (args.ministryIds && args.ministryIds.length) {
      const set = new Set(args.ministryIds);
      rows = rows.filter((r) => set.has(r.ministryId));
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    if (args.limit) rows = rows.slice(0, args.limit);

    const withDetails = await Promise.all(
      rows.map(async (progress) => {
        const person = await ctx.db.get("persons", progress.personId);
        const leadership = await ctx.db
          .query("personLeadership")
          .withIndex("by_person", (q) => q.eq("personId", progress.personId))
          .unique();
        return {
          progress,
          firstName: person?.firstName ?? "",
          lastName: person?.lastName ?? "",
          leadershipStatus: leadership?.status ?? ("none" as const),
        };
      }),
    );
    return withDetails;
  },
});

export const getPersonSendSummary = query({
  args: { personId: v.id("persons") },
  returns: v.object({
    status: progressStatus,
    leadershipStatus: v.union(
      v.literal("none"),
      v.literal("eligible"),
      v.literal("active"),
      v.literal("inactive"),
    ),
  }),
  handler: async (ctx, args) => {
    const progress = await getSendProgressInternal(ctx.db, args.personId);
    const leadership = await ctx.db
      .query("personLeadership")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .unique();
    return { status: progress?.status ?? "pending", leadershipStatus: leadership?.status ?? "none" };
  },
});

// ---------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------

/** EM3 completed → marks "enviar" row eligible (idempotent). */
export const ensureEligible = mutation({
  args: {
    personId: v.id("persons"),
    ministryId: v.id("ministries"),
    networkId: v.optional(v.id("networks")),
  },
  returns: sendProgressDoc,
  handler: async (ctx, args) => {
    const existing = await getSendProgressInternal(ctx.db, args.personId);
    const ts = now();
    if (existing) {
      if (existing.status === "pending") {
        await ctx.db.patch("personProcessProgress", existing._id, {
          status: "eligible",
          currentStep: "apto_enviar",
          updatedAt: ts,
        });
        return (await ctx.db.get("personProcessProgress", existing._id))!;
      }
      return existing;
    }
    const id = await ctx.db.insert("personProcessProgress", {
      personId: args.personId,
      processType: PROCESS,
      status: "eligible",
      stage: "enviar",
      currentStep: "apto_enviar",
      ministryId: args.ministryId,
      networkId: args.networkId,
      metadata: { from: "em3_completed" },
      createdAt: ts,
      updatedAt: ts,
    });
    return (await ctx.db.get("personProcessProgress", id))!;
  },
});

/** Starts (or resumes) Enviar. */
export const markEnviarProgress = mutation({
  args: {
    personId: v.id("persons"),
    ministryId: v.id("ministries"),
    networkId: v.optional(v.id("networks")),
    actorUserId: v.id("users"),
    note: v.optional(v.string()),
  },
  returns: sendProgressDoc,
  handler: async (ctx, args) => {
    const existing = await getSendProgressInternal(ctx.db, args.personId);
    const ts = now();
    let row = existing;
    if (!row) {
      const id = await ctx.db.insert("personProcessProgress", {
        personId: args.personId,
        processType: PROCESS,
        status: "in_progress",
        stage: "enviar",
        currentStep: "en_proceso",
        ministryId: args.ministryId,
        networkId: args.networkId,
        startedAt: ts,
        metadata: {},
        createdAt: ts,
        updatedAt: ts,
      });
      row = (await ctx.db.get("personProcessProgress", id))!;
    } else if (row.status !== "in_progress") {
      await ctx.db.patch("personProcessProgress", row._id, {
        status: "in_progress",
        currentStep: "en_proceso",
        startedAt: row.startedAt ?? ts,
        updatedAt: ts,
      });
      row = (await ctx.db.get("personProcessProgress", row._id))!;
    }

    await ctx.db.insert("personProcessEvents", {
      progressId: row._id,
      personId: args.personId,
      processType: PROCESS,
      eventType: "started",
      fromStatus: existing?.status,
      toStatus: "in_progress",
      actorUserId: args.actorUserId,
      note: args.note,
      metadata: {},
      createdAt: ts,
    });

    return row;
  },
});

/** Completes Enviar. Never activates leadership / creates cells. */
export const completeEnviar = mutation({
  args: {
    personId: v.id("persons"),
    ministryId: v.id("ministries"),
    networkId: v.optional(v.id("networks")),
    actorUserId: v.id("users"),
    note: v.optional(v.string()),
  },
  returns: sendProgressDoc,
  handler: async (ctx, args) => {
    let progress = await getSendProgressInternal(ctx.db, args.personId);
    const ts = now();
    if (!progress) {
      const id = await ctx.db.insert("personProcessProgress", {
        personId: args.personId,
        processType: PROCESS,
        status: "completed",
        stage: "enviar",
        currentStep: "completado",
        ministryId: args.ministryId,
        networkId: args.networkId,
        startedAt: ts,
        completedAt: ts,
        completedByUserId: args.actorUserId,
        metadata: { leadership_activated: false, cell_created: false },
        createdAt: ts,
        updatedAt: ts,
      });
      progress = (await ctx.db.get("personProcessProgress", id))!;
    } else {
      await ctx.db.patch("personProcessProgress", progress._id, {
        status: "completed",
        currentStep: "completado",
        completedAt: ts,
        completedByUserId: args.actorUserId,
        updatedAt: ts,
        metadata: {
          ...(progress.metadata ?? {}),
          leadership_activated: false,
          cell_created: false,
        },
      });
      progress = (await ctx.db.get("personProcessProgress", progress._id))!;
    }

    await ctx.db.insert("personProcessEvents", {
      progressId: progress._id,
      personId: args.personId,
      processType: PROCESS,
      eventType: "completed",
      toStatus: "completed",
      actorUserId: args.actorUserId,
      note: args.note,
      metadata: { leadership_activated: false },
      createdAt: ts,
    });

    return progress;
  },
});
