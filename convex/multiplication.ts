import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { conflict, forbidden, invalidArgument, notFound } from "./lib/errors";
import {
  isSuperadmin,
  requirePermission,
  type ConvexAuthContext,
} from "./lib/identity";
import { now } from "./lib/time";

type AuthDbCtx = QueryCtx | MutationCtx;

async function isDescendantOf(
  ctx: AuthDbCtx,
  ancestorPersonId: Id<"persons">,
  descendantPersonId: Id<"persons">,
): Promise<boolean> {
  if (ancestorPersonId === descendantPersonId) return true;
  const row = await ctx.db
    .query("leadershipClosure")
    .withIndex("by_ancestor_descendant", (q) =>
      q.eq("ancestorPersonId", ancestorPersonId).eq("descendantPersonId", descendantPersonId),
    )
    .unique();
  return Boolean(row && row.depth > 0);
}

/** Own + descendants + LG ministry. Blocks lateral/ascendant. */
async function assertStudentAccess(
  ctx: AuthDbCtx,
  auth: ConvexAuthContext,
  studentPersonId: Id<"persons">,
  ministryId?: Id<"ministries">,
) {
  if (isSuperadmin(auth)) return;
  if (
    ministryId &&
    auth.roleCodes.includes("leader_general") &&
    auth.ministryIds.includes(ministryId)
  ) {
    return;
  }
  if (auth.personId && auth.personId === studentPersonId) return;
  if (auth.personId && (await isDescendantOf(ctx, auth.personId as Id<"persons">, studentPersonId))) {
    return;
  }
  return forbidden(
    "Expediente fuera del subárbol pastoral autorizado (acceso lateral/ascendente prohibido).",
  );
}

async function assertExpedienteAccess(
  ctx: AuthDbCtx,
  auth: ConvexAuthContext,
  expedienteId: Id<"multiplicationExpedientes">,
) {
  const expediente = await ctx.db.get(expedienteId);
  if (!expediente) return notFound("Expediente no encontrado.");
  await assertStudentAccess(ctx, auth, expediente.studentPersonId, expediente.ministryId);
  return expediente;
}

const expedienteStatus = v.union(
  v.literal("open"),
  v.literal("completed"),
  v.literal("archived"),
);

const contactStatus = v.union(
  v.literal("contact"),
  v.literal("following"),
  v.literal("won"),
  v.literal("dropped"),
);

const discipleCohort = v.union(v.literal("first_six"), v.literal("second_six"));
const discipleOrigin = v.union(
  v.literal("won"),
  v.literal("recovered"),
  v.literal("assigned"),
);
const formationStatus = v.union(
  v.literal("en_formacion"),
  v.literal("apto_liderar"),
  v.literal("lider_aprobado"),
  v.literal("lider_activo_celula"),
);

const milestoneLevel = v.union(
  v.literal("cd1"),
  v.literal("cd2"),
  v.literal("cd3"),
  v.literal("reencuentro"),
  v.literal("em1"),
  v.literal("em2"),
  v.literal("em3"),
);

const milestoneStatus = v.union(
  v.literal("pending"),
  v.literal("met"),
  v.literal("waived"),
  v.literal("blocked"),
);

export const getExpedienteByStudent = query({
  args: { studentPersonId: v.id("persons") },
  handler: async (ctx, args) => {
    const { auth } = await requirePermission(ctx, "process.read");
    const row = await ctx.db
      .query("multiplicationExpedientes")
      .withIndex("by_student", (q) => q.eq("studentPersonId", args.studentPersonId))
      .first();
    if (!row) return null;
    await assertStudentAccess(ctx, auth, row.studentPersonId, row.ministryId);
    return row;
  },
});

export const listExpedientesByMinistry = query({
  args: {
    ministryId: v.optional(v.id("ministries")),
    status: v.optional(expedienteStatus),
  },
  handler: async (ctx, args) => {
    const { auth } = await requirePermission(ctx, "process.read");
    let rows;
    if (args.ministryId) {
      if (
        !isSuperadmin(auth) &&
        !auth.ministryIds.includes(args.ministryId) &&
        !auth.roleCodes.includes("leader_general")
      ) {
        // Tree leaders may still list within their ministry assignment.
        if (!auth.ministryIds.includes(args.ministryId)) {
          return [];
        }
      }
      rows = await ctx.db
        .query("multiplicationExpedientes")
        .withIndex("by_ministry_status", (q) =>
          q.eq("ministryId", args.ministryId!).eq("status", args.status ?? "open"),
        )
        .collect();
    } else if (args.status) {
      if (!isSuperadmin(auth) && !auth.roleCodes.includes("leader_general")) {
        // Non-LG must scope by ministry — no unfiltered collect.
        const ministryId = auth.ministryIds[0] as Id<"ministries"> | undefined;
        if (!ministryId) return [];
        rows = await ctx.db
          .query("multiplicationExpedientes")
          .withIndex("by_ministry_status", (q) =>
            q.eq("ministryId", ministryId).eq("status", args.status!),
          )
          .collect();
      } else {
        rows = await ctx.db
          .query("multiplicationExpedientes")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect();
      }
    } else if (isSuperadmin(auth)) {
      rows = await ctx.db.query("multiplicationExpedientes").collect();
    } else {
      const ministryId = auth.ministryIds[0] as Id<"ministries"> | undefined;
      if (!ministryId) return [];
      rows = await ctx.db
        .query("multiplicationExpedientes")
        .withIndex("by_ministry_status", (q) =>
          q.eq("ministryId", ministryId).eq("status", "open"),
        )
        .collect();
    }

    // Tree filter for regular leaders.
    if (
      auth.personId &&
      auth.roleCodes.includes("leader") &&
      !auth.roleCodes.includes("leader_general") &&
      !isSuperadmin(auth)
    ) {
      const out = [];
      for (const row of rows) {
        if (row.studentPersonId === auth.personId) {
          out.push(row);
          continue;
        }
        if (await isDescendantOf(ctx, auth.personId as Id<"persons">, row.studentPersonId)) {
          out.push(row);
        }
      }
      return out;
    }
    return rows;
  },
});

export const getExpedienteBundle = query({
  args: { expedienteId: v.id("multiplicationExpedientes") },
  handler: async (ctx, args) => {
    const { auth } = await requirePermission(ctx, "process.read");
    const expediente = await assertExpedienteAccess(ctx, auth, args.expedienteId);
    if (!expediente) return null;
    const [contacts, disciples, milestones] = await Promise.all([
      ctx.db
        .query("multiplicationContacts")
        .withIndex("by_expediente", (q) => q.eq("expedienteId", args.expedienteId))
        .collect(),
      ctx.db
        .query("multiplicationDisciples")
        .withIndex("by_expediente", (q) => q.eq("expedienteId", args.expedienteId))
        .collect(),
      ctx.db
        .query("multiplicationMilestones")
        .withIndex("by_expediente", (q) => q.eq("expedienteId", args.expedienteId))
        .collect(),
    ]);
    return { expediente, contacts, disciples, milestones };
  },
});

export const openExpediente = mutation({
  args: {
    studentPersonId: v.id("persons"),
    ministryId: v.id("ministries"),
    networkId: v.optional(v.id("networks")),
    openedAtAcademicLevel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { auth } = await requirePermission(ctx, "destination.manage");
    await assertStudentAccess(ctx, auth, args.studentPersonId, args.ministryId);
    const existing = await ctx.db
      .query("multiplicationExpedientes")
      .withIndex("by_student", (q) => q.eq("studentPersonId", args.studentPersonId))
      .first();
    if (existing && existing.status === "open") {
      return existing;
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "open",
        ministryId: args.ministryId,
        networkId: args.networkId,
        openedAtAcademicLevel: args.openedAtAcademicLevel,
        updatedAt: now(),
      });
      return await ctx.db.get(existing._id);
    }
    const ts = now();
    const id = await ctx.db.insert("multiplicationExpedientes", {
      studentPersonId: args.studentPersonId,
      ministryId: args.ministryId,
      networkId: args.networkId,
      status: "open",
      openedAtAcademicLevel: args.openedAtAcademicLevel,
      createdAt: ts,
      updatedAt: ts,
    });
    return await ctx.db.get(id);
  },
});

export const upsertContact = mutation({
  args: {
    expedienteId: v.id("multiplicationExpedientes"),
    orderIndex: v.number(),
    fullName: v.string(),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(contactStatus),
  },
  handler: async (ctx, args) => {
    const { auth } = await requirePermission(ctx, "destination.manage");
    if (args.orderIndex < 1 || args.orderIndex > 15) {
      return invalidArgument("orderIndex debe estar entre 1 y 15.");
    }
    await assertExpedienteAccess(ctx, auth, args.expedienteId);
    const existing = await ctx.db
      .query("multiplicationContacts")
      .withIndex("by_expediente_order", (q) =>
        q.eq("expedienteId", args.expedienteId).eq("orderIndex", args.orderIndex),
      )
      .unique();
    const ts = now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        fullName: args.fullName.trim(),
        phone: args.phone,
        notes: args.notes,
        status: args.status ?? existing.status,
        updatedAt: ts,
      });
      return await ctx.db.get(existing._id);
    }
    const id = await ctx.db.insert("multiplicationContacts", {
      expedienteId: args.expedienteId,
      orderIndex: args.orderIndex,
      fullName: args.fullName.trim(),
      phone: args.phone,
      notes: args.notes,
      status: args.status ?? "contact",
      createdAt: ts,
      updatedAt: ts,
    });
    return await ctx.db.get(id);
  },
});

export const linkContactAsWon = mutation({
  args: {
    contactId: v.id("multiplicationContacts"),
    linkedPersonId: v.id("persons"),
  },
  handler: async (ctx, args) => {
    const { auth } = await requirePermission(ctx, "destination.manage");
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return notFound("Contacto no encontrado.");
    await assertExpedienteAccess(ctx, auth, contact.expedienteId);
    const person = await ctx.db.get(args.linkedPersonId);
    if (!person) return notFound("Persona no encontrada.");
    await ctx.db.patch(args.contactId, {
      linkedPersonId: args.linkedPersonId,
      status: "won",
      wonAt: now(),
      updatedAt: now(),
    });
    return await ctx.db.get(args.contactId);
  },
});

export const assignDisciple = mutation({
  args: {
    expedienteId: v.id("multiplicationExpedientes"),
    personId: v.id("persons"),
    slotIndex: v.number(),
    cohort: discipleCohort,
    origin: discipleOrigin,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { auth } = await requirePermission(ctx, "destination.manage");
    if (args.slotIndex < 1 || args.slotIndex > 12) {
      return invalidArgument("slotIndex debe estar entre 1 y 12.");
    }
    await assertExpedienteAccess(ctx, auth, args.expedienteId);

    const byPerson = await ctx.db
      .query("multiplicationDisciples")
      .withIndex("by_expediente_person", (q) =>
        q.eq("expedienteId", args.expedienteId).eq("personId", args.personId),
      )
      .unique();
    if (byPerson) {
      return conflict("Esta persona ya ocupa un slot en el equipo de 12.");
    }

    const bySlot = await ctx.db
      .query("multiplicationDisciples")
      .withIndex("by_expediente_slot", (q) =>
        q.eq("expedienteId", args.expedienteId).eq("slotIndex", args.slotIndex),
      )
      .unique();
    if (bySlot) {
      return conflict("El slot ya está ocupado.");
    }

    const ts = now();
    const id = await ctx.db.insert("multiplicationDisciples", {
      expedienteId: args.expedienteId,
      personId: args.personId,
      slotIndex: args.slotIndex,
      cohort: args.cohort,
      origin: args.origin,
      formationStatus: "en_formacion",
      assignedAt: ts,
      notes: args.notes,
      createdAt: ts,
      updatedAt: ts,
    });
    return await ctx.db.get(id);
  },
});

export const updateDiscipleFormation = mutation({
  args: {
    discipleId: v.id("multiplicationDisciples"),
    formationStatus,
    cellId: v.optional(v.id("cells")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { auth } = await requirePermission(ctx, "leaders.activate");
    const row = await ctx.db.get(args.discipleId);
    if (!row) return notFound("Discípulo no encontrado.");
    await assertExpedienteAccess(ctx, auth, row.expedienteId);
    const cellId = args.cellId ?? row.cellId;
    if (args.formationStatus === "lider_activo_celula") {
      if (!cellId) {
        return invalidArgument("Líder activo requiere una célula real.");
      }
      const cell = await ctx.db.get(cellId);
      if (!cell || cell.status !== "active") {
        return invalidArgument("La célula debe existir y estar activa.");
      }
      const leadership = await ctx.db
        .query("personLeadership")
        .withIndex("by_person", (q) => q.eq("personId", row.personId))
        .unique();
      if (!leadership || leadership.status !== "active") {
        return invalidArgument(
          "Líder activo requiere autorización pastoral (personLeadership.status = active).",
        );
      }
    } else if (args.cellId) {
      const cell = await ctx.db.get(args.cellId);
      if (!cell || cell.status !== "active") {
        return invalidArgument("La célula debe existir y estar activa.");
      }
    }
    await ctx.db.patch(args.discipleId, {
      formationStatus: args.formationStatus,
      cellId: args.cellId ?? row.cellId,
      notes: args.notes ?? row.notes,
      updatedAt: now(),
    });
    return await ctx.db.get(args.discipleId);
  },
});

export const upsertMilestone = mutation({
  args: {
    expedienteId: v.id("multiplicationExpedientes"),
    level: milestoneLevel,
    key: v.string(),
    status: milestoneStatus,
    evidence: v.optional(v.any()),
    note: v.optional(v.string()),
    updatedByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { auth } = await requirePermission(ctx, "destination.manage");
    await assertExpedienteAccess(ctx, auth, args.expedienteId);
    const existing = await ctx.db
      .query("multiplicationMilestones")
      .withIndex("by_expediente_level_key", (q) =>
        q
          .eq("expedienteId", args.expedienteId)
          .eq("level", args.level)
          .eq("key", args.key),
      )
      .unique();
    const ts = now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        evidence: args.evidence,
        note: args.note,
        updatedByUserId: args.updatedByUserId,
        updatedAt: ts,
      });
      return await ctx.db.get(existing._id);
    }
    const id = await ctx.db.insert("multiplicationMilestones", {
      expedienteId: args.expedienteId,
      level: args.level,
      key: args.key,
      status: args.status,
      evidence: args.evidence,
      note: args.note,
      updatedByUserId: args.updatedByUserId,
      createdAt: ts,
      updatedAt: ts,
    });
    return await ctx.db.get(id);
  },
});
