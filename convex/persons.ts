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

export async function getCurrentOrgForPerson(
  ctx: QueryCtx | MutationCtx,
  personId: Id<"persons">,
): Promise<{
  ministryId?: Id<"ministries">;
  networkId?: Id<"networks">;
  effectiveFrom: number;
} | null> {
  const rows = await ctx.db
    .query("personOrganizationHistory")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .collect();
  const current = rows
    .filter((r) => r.effectiveTo === undefined)
    .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];
  if (!current) return null;
  return {
    ministryId: current.ministryId,
    networkId: current.networkId,
    effectiveFrom: current.effectiveFrom,
  };
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

/** Batch lookup — used by callers needing display names for a set of ids. */
export const getManyByIds = query({
  args: { personIds: v.array(v.id("persons")) },
  returns: v.array(personDoc),
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.personIds.map((id) => ctx.db.get("persons", id)));
    return rows.filter((p): p is NonNullable<typeof p> => p !== null);
  },
});

/** Current (effectiveTo = undefined) Ministry/Red assignment for a person, or `null`. */
export const getCurrentOrg = query({
  args: { personId: v.id("persons") },
  returns: v.union(
    v.object({
      ministryId: v.optional(v.id("ministries")),
      networkId: v.optional(v.id("networks")),
      effectiveFrom: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await getCurrentOrgForPerson(ctx, args.personId);
  },
});

/** Full organizational history for a person, most recent first. */
export const getOrgHistory = query({
  args: { personId: v.id("persons") },
  returns: v.array(
    v.object({
      _id: v.id("personOrganizationHistory"),
      ministryId: v.optional(v.id("ministries")),
      networkId: v.optional(v.id("networks")),
      effectiveFrom: v.number(),
      effectiveTo: v.optional(v.number()),
      changeReason: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("personOrganizationHistory")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    return rows
      .sort((a, b) => b.effectiveFrom - a.effectiveFrom)
      .map((r) => ({
        _id: r._id,
        ministryId: r.ministryId,
        networkId: r.networkId,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        changeReason: r.changeReason,
      }));
  },
});

/**
 * Candidate rows for GANAR duplicate detection: exact `phoneNormalized`
 * match plus a broader last-9-digit suffix scan (mirrors the Drizzle
 * `eq OR right(..., 9) = ...` query). Strength scoring stays in the Next
 * layer (`modules/ganar/normalize.ts`).
 */
export const findDuplicateCandidates = query({
  args: { phoneNormalized: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("persons"),
      firstName: v.string(),
      lastName: v.string(),
      phone: v.optional(v.string()),
      phoneNormalized: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const suffix = args.phoneNormalized.slice(-9);

    const exact = await ctx.db
      .query("persons")
      .withIndex("by_phoneNormalized", (q) => q.eq("phoneNormalized", args.phoneNormalized))
      .collect();

    const active = await ctx.db
      .query("persons")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    const suffixMatches = active.filter(
      (p) =>
        p.deletedAt === undefined &&
        p.phoneNormalized !== undefined &&
        p.phoneNormalized !== args.phoneNormalized &&
        p.phoneNormalized.slice(-9) === suffix,
    );

    const byId = new Map<Id<"persons">, (typeof exact)[number]>();
    for (const row of [...exact, ...suffixMatches]) {
      if (row.deletedAt !== undefined) continue;
      byId.set(row._id, row);
    }

    return [...byId.values()].slice(0, limit).map((row) => ({
      _id: row._id,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      phoneNormalized: row.phoneNormalized,
    }));
  },
});

/**
 * All active persons with their current Ministry/Red assignment attached
 * (only persons that have one, matching the Drizzle inner-join semantics).
 * Bounded scan — filtering, sorting, pagination and stats are computed in
 * the Next layer (`modules/ganar/service.ts`), mirroring the MVP approach
 * used elsewhere in this module.
 */
export const listActiveWithOrg = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("persons"),
      firstName: v.string(),
      lastName: v.string(),
      phone: v.optional(v.string()),
      phoneNormalized: v.optional(v.string()),
      email: v.optional(v.string()),
      districtId: v.optional(v.id("districts")),
      prayerRequest: v.optional(v.string()),
      source: personSource,
      registeredAt: v.number(),
      ministryId: v.id("ministries"),
      networkId: v.id("networks"),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("persons")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    const active = rows.filter((p) => p.deletedAt === undefined);

    const results = [];
    for (const person of active) {
      const org = await getCurrentOrgForPerson(ctx, person._id);
      if (!org?.ministryId || !org.networkId) continue;
      results.push({
        _id: person._id,
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        phoneNormalized: person.phoneNormalized,
        email: person.email,
        districtId: person.districtId,
        prayerRequest: person.prayerRequest,
        source: person.source,
        registeredAt: person.registeredAt,
        ministryId: org.ministryId,
        networkId: org.networkId,
      });
    }
    return results;
  },
});

/**
 * Active persons whose current Ministry matches `ministryId`, filtered by a
 * case-insensitive name/phone substring. Used by Célula member search.
 */
export const searchActiveInMinistry = query({
  args: { ministryId: v.id("ministries"), search: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("persons"),
      firstName: v.string(),
      lastName: v.string(),
      phone: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const needle = args.search.trim().toLowerCase();
    if (needle.length < 2) return [];

    const inMinistry = await personIdsWithCurrentMinistry(ctx, args.ministryId);
    const rows = await ctx.db
      .query("persons")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const matches = rows.filter((p) => {
      if (p.deletedAt !== undefined) return false;
      if (!inMinistry.has(p._id)) return false;
      const haystacks = [p.firstName, p.lastName, p.phone, `${p.firstName} ${p.lastName}`].filter(
        (v): v is string => Boolean(v),
      );
      return haystacks.some((h) => h.toLowerCase().includes(needle));
    });

    matches.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    return matches.slice(0, limit).map((p) => ({
      _id: p._id,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
    }));
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

/** Counts `personIntakeEvents` for an `ipHash`/`source` since `sinceMs` — public-form rate limiting. */
export const countRecentIntakeEvents = query({
  args: { ipHash: v.string(), source: personSource, sinceMs: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("personIntakeEvents")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .collect();
    return rows.filter((r) => r.source === args.source && r.createdAt >= args.sinceMs).length;
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
