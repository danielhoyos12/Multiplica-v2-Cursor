import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { conflict, invalidArgument, notFound } from "./lib/errors";
import { now } from "./lib/time";

/**
 * GANAR — Persona Maestra domain module.
 * Mirrors `src/modules/ganar/service.ts` (Drizzle/Postgres) at MVP scope:
 * text search and Ministry/Red scoping use `collect()` + in-memory filter
 * rather than compound indexes (schema has no compound index for the
 * "current organizational assignment" join — see `personOrganizationHistory`).
 */

/** Matches the `persons` table shape in `schema.ts`. */
export const personDoc = v.object({
  _id: v.id("persons"),
  _creationTime: v.number(),
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
  legacyPostgresId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const personSource = v.union(v.literal("internal_form"), v.literal("public_form"));

function normalizePhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D+/g, "");
  return digits || undefined;
}

async function personIdsWithCurrentMinistry(
  ctx: QueryCtx | MutationCtx,
  ministryId: Id<"ministries">,
): Promise<Set<Id<"persons">>> {
  const rows = await ctx.db
    .query("personOrganizationHistory")
    .withIndex("by_ministry", (q) => q.eq("ministryId", ministryId))
    .collect();
  return new Set(rows.filter((r) => r.effectiveTo === undefined).map((r) => r.personId));
}

async function personIdsWithCurrentNetwork(
  ctx: QueryCtx | MutationCtx,
  networkId: Id<"networks">,
): Promise<Set<Id<"persons">>> {
  const rows = await ctx.db
    .query("personOrganizationHistory")
    .withIndex("by_network", (q) => q.eq("networkId", networkId))
    .collect();
  return new Set(rows.filter((r) => r.effectiveTo === undefined).map((r) => r.personId));
}

async function insertPersonWithOrg(
  ctx: MutationCtx,
  params: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    address?: string;
    districtId?: Id<"districts">;
    prayerRequest?: string;
    notes?: string;
    ministryId: Id<"ministries">;
    networkId: Id<"networks">;
    source: "internal_form" | "public_form";
    createdByUserId?: Id<"users">;
  },
): Promise<Id<"persons">> {
  const ts = now();

  const personId = await ctx.db.insert("persons", {
    firstName: params.firstName,
    lastName: params.lastName,
    phone: params.phone,
    phoneNormalized: normalizePhone(params.phone),
    email: params.email,
    address: params.address,
    districtId: params.districtId,
    prayerRequest: params.prayerRequest,
    notes: params.notes,
    source: params.source,
    isActive: true,
    registeredAt: ts,
    createdAt: ts,
    updatedAt: ts,
  });

  await ctx.db.insert("personOrganizationHistory", {
    personId,
    ministryId: params.ministryId,
    networkId: params.networkId,
    changeReason: params.source === "public_form" ? "ganar.public" : "ganar.internal",
    createdByUserId: params.createdByUserId,
    effectiveFrom: ts,
    createdAt: ts,
  });

  return personId;
}

async function logIntakeEvent(
  ctx: MutationCtx,
  params: {
    personId?: Id<"persons">;
    ministryId?: Id<"ministries">;
    networkId?: Id<"networks">;
    source: "internal_form" | "public_form";
    outcome: string;
    ipHash?: string;
    userAgentHash?: string;
  },
): Promise<void> {
  await ctx.db.insert("personIntakeEvents", {
    personId: params.personId,
    ministryId: params.ministryId,
    networkId: params.networkId,
    source: params.source,
    outcome: params.outcome,
    ipHash: params.ipHash,
    userAgentHash: params.userAgentHash,
    createdAt: now(),
  });
}

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

/**
 * Lists active persons for an actor with optional Ministry/Red/search
 * filters. MVP scoping — collects the active-person set and filters in
 * memory; `actorUserId` is accepted for future authorization wiring.
 */
export const listForActor = query({
  args: {
    actorUserId: v.optional(v.id("users")),
    ministryId: v.optional(v.id("ministries")),
    networkId: v.optional(v.id("networks")),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(personDoc),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    let allowedIds: Set<Id<"persons">> | null = null;
    if (args.ministryId) {
      allowedIds = await personIdsWithCurrentMinistry(ctx, args.ministryId);
    }
    if (args.networkId) {
      const byNetwork = await personIdsWithCurrentNetwork(ctx, args.networkId);
      allowedIds = allowedIds
        ? new Set([...allowedIds].filter((id) => byNetwork.has(id)))
        : byNetwork;
    }

    const rows = await ctx.db
      .query("persons")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const search = args.search?.trim().toLowerCase();

    const filtered = rows.filter((person) => {
      if (person.deletedAt !== undefined) return false;
      if (allowedIds && !allowedIds.has(person._id)) return false;
      if (search) {
        const haystacks = [person.firstName, person.lastName, person.email, person.phone].filter(
          (value): value is string => Boolean(value),
        );
        if (!haystacks.some((value) => value.toLowerCase().includes(search))) return false;
      }
      return true;
    });

    filtered.sort((a, b) => b.registeredAt - a.registeredAt);
    return filtered.slice(0, limit);
  },
});

export const getById = query({
  args: { personId: v.id("persons") },
  returns: v.union(personDoc, v.null()),
  handler: async (ctx, args) => {
    const person = await ctx.db.get("persons", args.personId);
    if (!person || person.deletedAt !== undefined) return null;
    return person;
  },
});

// ---------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------

/** Internal capture (GANAR form used by staff). Requires an active Ministry/Red. */
export const createInternal = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    districtId: v.optional(v.id("districts")),
    prayerRequest: v.optional(v.string()),
    notes: v.optional(v.string()),
    ministryId: v.id("ministries"),
    networkId: v.id("networks"),
    createdByUserId: v.optional(v.id("users")),
  },
  returns: personDoc,
  handler: async (ctx, args) => {
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) {
      return invalidArgument("Nombre y apellido son obligatorios.");
    }

    const ministry = await ctx.db.get("ministries", args.ministryId);
    if (!ministry || !ministry.isActive) return notFound("Ministerio no disponible.");

    const network = await ctx.db.get("networks", args.networkId);
    if (!network || !network.isActive || network.code === "ninos") {
      return invalidArgument("La Red seleccionada no está disponible para captura.");
    }

    if (args.districtId) {
      const district = await ctx.db.get("districts", args.districtId);
      if (!district || !district.isActive) return notFound("Distrito no disponible.");
    }

    const personId = await insertPersonWithOrg(ctx, {
      firstName,
      lastName,
      phone: args.phone?.trim() || undefined,
      email: args.email?.trim() || undefined,
      address: args.address?.trim() || undefined,
      districtId: args.districtId,
      prayerRequest: args.prayerRequest?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      ministryId: args.ministryId,
      networkId: args.networkId,
      source: "internal_form",
      createdByUserId: args.createdByUserId,
    });

    return (await ctx.db.get("persons", personId))!;
  },
});

/**
 * Public GANAR intake (share-link form). Never leaks whether the person
 * already existed — always returns `{ ok: true }` and logs a
 * `personIntakeEvents` outcome for observability/rate-limiting.
 */
export const createPublic = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    districtId: v.optional(v.id("districts")),
    prayerRequest: v.optional(v.string()),
    ministryId: v.id("ministries"),
    networkId: v.id("networks"),
    ipHash: v.optional(v.string()),
    userAgentHash: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();

    const reject = async (outcome: string) => {
      await logIntakeEvent(ctx, {
        source: "public_form",
        outcome,
        ministryId: args.ministryId,
        networkId: args.networkId,
        ipHash: args.ipHash,
        userAgentHash: args.userAgentHash,
      });
      return { ok: true as const };
    };

    if (!firstName || !lastName) return reject("rejected_validation");

    const ministry = await ctx.db.get("ministries", args.ministryId);
    if (!ministry || !ministry.isActive) return reject("rejected_ministry");

    const network = await ctx.db.get("networks", args.networkId);
    if (!network || !network.isActive || network.code === "ninos") {
      return reject("rejected_network");
    }

    if (args.districtId) {
      const district = await ctx.db.get("districts", args.districtId);
      if (!district || !district.isActive) return reject("rejected_district");
    }

    const personId = await insertPersonWithOrg(ctx, {
      firstName,
      lastName,
      phone: args.phone?.trim() || undefined,
      address: args.address?.trim() || undefined,
      districtId: args.districtId,
      prayerRequest: args.prayerRequest?.trim() || undefined,
      ministryId: args.ministryId,
      networkId: args.networkId,
      source: "public_form",
    });

    await logIntakeEvent(ctx, {
      personId,
      source: "public_form",
      outcome: "created",
      ministryId: args.ministryId,
      networkId: args.networkId,
      ipHash: args.ipHash,
      userAgentHash: args.userAgentHash,
    });

    return { ok: true as const };
  },
});

export const update = mutation({
  args: {
    personId: v.id("persons"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    districtId: v.optional(v.id("districts")),
    prayerRequest: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: personDoc,
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("persons", args.personId);
    if (!existing || existing.deletedAt !== undefined) {
      return notFound("Persona no encontrada.");
    }

    if (args.districtId) {
      const district = await ctx.db.get("districts", args.districtId);
      if (!district || !district.isActive) return notFound("Distrito no disponible.");
    }

    const patch: Record<string, unknown> = { updatedAt: now() };
    if (args.firstName !== undefined) {
      const trimmed = args.firstName.trim();
      if (!trimmed) return invalidArgument("El nombre no puede estar vacío.");
      patch.firstName = trimmed;
    }
    if (args.lastName !== undefined) {
      const trimmed = args.lastName.trim();
      if (!trimmed) return invalidArgument("El apellido no puede estar vacío.");
      patch.lastName = trimmed;
    }
    if (args.phone !== undefined) {
      const trimmed = args.phone.trim();
      patch.phone = trimmed || undefined;
      patch.phoneNormalized = normalizePhone(trimmed);
    }
    if (args.email !== undefined) patch.email = args.email.trim() || undefined;
    if (args.address !== undefined) patch.address = args.address.trim() || undefined;
    if (args.districtId !== undefined) patch.districtId = args.districtId;
    if (args.prayerRequest !== undefined) {
      patch.prayerRequest = args.prayerRequest.trim() || undefined;
    }
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;

    await ctx.db.patch("persons", args.personId, patch);
    return (await ctx.db.get("persons", args.personId))!;
  },
});

/**
 * Append-only GANAR intake telemetry (rate-limit support / audit).
 * Standalone from `createPublic` so callers can log rejection outcomes
 * (e.g. rate-limited) without creating a person.
 */
export const recordIntakeEvent = mutation({
  args: {
    personId: v.optional(v.id("persons")),
    ministryId: v.optional(v.id("ministries")),
    networkId: v.optional(v.id("networks")),
    source: personSource,
    outcome: v.string(),
    ipHash: v.optional(v.string()),
    userAgentHash: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("personIntakeEvents"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("personIntakeEvents", {
      personId: args.personId,
      ministryId: args.ministryId,
      networkId: args.networkId,
      source: args.source,
      outcome: args.outcome,
      ipHash: args.ipHash,
      userAgentHash: args.userAgentHash,
      metadata: args.metadata,
      createdAt: now(),
    });
  },
});

/** Soft delete — sets `deletedAt` + `isActive: false`. Never hard-deletes pastoral records. */
export const softDelete = mutation({
  args: { personId: v.id("persons") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const person = await ctx.db.get("persons", args.personId);
    if (!person) return notFound("Persona no encontrada.");
    if (person.deletedAt !== undefined) return conflict("La persona ya fue eliminada.");

    const ts = now();
    await ctx.db.patch("persons", args.personId, {
      isActive: false,
      deletedAt: ts,
      updatedAt: ts,
    });
    return null;
  },
});
