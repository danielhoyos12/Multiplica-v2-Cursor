import { and, asc, count, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { getDb } from "@/db/client";
import {
  districts,
  ministries,
  networks,
  personIntakeEvents,
  personOrganizationHistory,
  persons,
} from "@/db/schema";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { writeAuditLog } from "@/modules/audit";
import {
  assertCanMutate,
  assertCanView,
  canAccessMinistry,
  isSuperadmin,
  loadAuthContext,
  type AuthContext,
  type NetworkCode,
} from "@/modules/authorization";

import {
  formatFullName,
  namesLookSimilar,
  normalizePhone,
  phonesMatchStrong,
  splitFullName,
} from "./normalize";
import {
  assertActorMayCaptureNetwork,
  assertNetworkAllowedForCapture,
  ganarPersonInputSchema,
  publicGanarInputSchema,
  type GanarPersonInput,
  type PublicGanarInput,
} from "./validation";

export type DuplicateMatch = {
  strength: "strong" | "possible";
  personId: string;
  fullName: string;
  phone: string | null;
  ministryId: string | null;
};

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function requireActor(userId: string): Promise<AuthContext> {
  return loadAuthContext(userId);
}

async function loadNetwork(networkId: string) {
  const db = getDb();
  const [row] = await db.select().from(networks).where(eq(networks.id, networkId)).limit(1);
  if (!row) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Red no encontrada.");
  }
  return row;
}

async function loadMinistry(ministryId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.id, ministryId))
    .limit(1);
  if (!row || !row.isActive) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no disponible.");
  }
  return row;
}

async function dbNetworksForActor(actor: AuthContext) {
  const db = getDb();
  if (actor.networkIds.length === 0) {
    return [] as { id: string; code: string }[];
  }
  return db
    .select({ id: networks.id, code: networks.code })
    .from(networks)
    .where(sql`${networks.id} in (${sql.join(
      actor.networkIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`);
}

async function currentOrg(personId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      ministryId: personOrganizationHistory.ministryId,
      networkId: personOrganizationHistory.networkId,
      effectiveFrom: personOrganizationHistory.effectiveFrom,
    })
    .from(personOrganizationHistory)
    .where(
      and(
        eq(personOrganizationHistory.personId, personId),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .orderBy(desc(personOrganizationHistory.effectiveFrom))
    .limit(1);
  return row ?? null;
}

export async function findDuplicateCandidates(params: {
  phone: string;
  firstName: string;
  lastName: string;
  ministryScopeIds?: string[] | null;
}): Promise<DuplicateMatch[]> {
  const db = getDb();
  const phoneNormalized = normalizePhone(params.phone);
  if (!phoneNormalized) return [];

  const rows = await db
    .select({
      id: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      phone: persons.phone,
      phoneNormalized: persons.phoneNormalized,
    })
    .from(persons)
    .where(
      and(
        isNull(persons.deletedAt),
        or(
          eq(persons.phoneNormalized, phoneNormalized),
          sql`right(${persons.phoneNormalized}, 9) = ${phoneNormalized.slice(-9)}`,
        ),
      ),
    )
    .limit(20);

  const matches: DuplicateMatch[] = [];
  for (const row of rows) {
    const org = await currentOrg(row.id);
    if (
      params.ministryScopeIds &&
      params.ministryScopeIds.length > 0 &&
      org?.ministryId &&
      !params.ministryScopeIds.includes(org.ministryId)
    ) {
      continue;
    }

    const strong = phonesMatchStrong(row.phoneNormalized, phoneNormalized);

    const possible =
      !strong &&
      namesLookSimilar(params.firstName, params.lastName, row.firstName, row.lastName);

    if (strong || possible) {
      matches.push({
        strength: strong ? "strong" : "possible",
        personId: row.id,
        fullName: formatFullName(row.firstName, row.lastName),
        phone: row.phone,
        ministryId: org?.ministryId ?? null,
      });
    }
  }

  return matches.sort((left, right) => {
    if (left.strength === right.strength) return 0;
    return left.strength === "strong" ? -1 : 1;
  });
}

async function insertPersonWithOrg(params: {
  firstName: string;
  lastName: string;
  phone: string;
  phoneNormalized: string | null;
  address: string;
  districtId: string;
  prayerRequest: string | null;
  email: string | null;
  ministryId: string;
  networkId: string;
  source: "internal_form" | "public_form";
  actorUserId: string | null;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [person] = await tx
      .insert(persons)
      .values({
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone,
        phoneNormalized: params.phoneNormalized,
        address: params.address,
        districtId: params.districtId,
        prayerRequest: params.prayerRequest,
        email: params.email,
        source: params.source,
        isActive: true,
      })
      .returning();

    await tx.insert(personOrganizationHistory).values({
      personId: person.id,
      ministryId: params.ministryId,
      networkId: params.networkId,
      changeReason: params.source === "public_form" ? "ganar.public" : "ganar.internal",
      createdByUserId: params.actorUserId,
    });

    return person;
  });
}

export async function createPersonInternal(
  actorUserId: string,
  raw: GanarPersonInput,
): Promise<{ personId: string; duplicates?: DuplicateMatch[] }> {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "persons.write", {
    type: "person",
    ministryId: raw.ministryId,
  });

  const input = ganarPersonInputSchema.parse(raw);
  if (!canAccessMinistry(actor, input.ministryId) && !isSuperadmin(actor)) {
    throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Ministerio fuera de alcance.");
  }

  await loadMinistry(input.ministryId);
  const network = await loadNetwork(input.networkId);
  assertNetworkAllowedForCapture({
    networkCode: network.code as NetworkCode,
    networkIsActive: network.isActive,
  });

  const actorNetworkCodes = (
    await dbNetworksForActor(actor)
  ).map((n) => n.code as NetworkCode);
  assertActorMayCaptureNetwork(actorNetworkCodes, network.code as NetworkCode);

  const [district] = await getDb()
    .select({ id: districts.id })
    .from(districts)
    .where(and(eq(districts.id, input.districtId), eq(districts.isActive, true)))
    .limit(1);
  if (!district) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Distrito no disponible.");
  }

  const { firstName, lastName } = splitFullName(input.fullName);
  const phoneNormalized = normalizePhone(input.phone);
  const duplicates = await findDuplicateCandidates({
    phone: input.phone,
    firstName,
    lastName,
    ministryScopeIds: isSuperadmin(actor) ? null : actor.ministryIds,
  });

  const strong = duplicates.filter((d) => d.strength === "strong");
  if (strong.length > 0 && !input.forceCreate) {
    await writeAuditLog({
      actorUserId,
      action: "person.possible_duplicate_detected",
      entityType: "person",
      entityId: strong[0]?.personId,
      metadata: {
        strength: "strong",
        ministryId: input.ministryId,
        networkId: input.networkId,
        matchCount: strong.length,
      },
    });
    return { personId: strong[0].personId, duplicates };
  }

  if (duplicates.some((d) => d.strength === "possible") && !input.forceCreate) {
    await writeAuditLog({
      actorUserId,
      action: "person.possible_duplicate_detected",
      entityType: "person",
      metadata: {
        strength: "possible",
        ministryId: input.ministryId,
        networkId: input.networkId,
        matchCount: duplicates.length,
      },
    });
    return { personId: "", duplicates };
  }

  const person = await insertPersonWithOrg({
    firstName,
    lastName,
    phone: input.phone.trim(),
    phoneNormalized,
    address: input.address.trim(),
    districtId: input.districtId,
    prayerRequest: input.prayerRequest?.trim() || null,
    email: input.email?.trim() || null,
    ministryId: input.ministryId,
    networkId: input.networkId,
    source: "internal_form",
    actorUserId,
  });

  await writeAuditLog({
    actorUserId,
    action: "person.created.internal",
    entityType: "person",
    entityId: person.id,
    afterData: {
      firstName: person.firstName,
      lastName: person.lastName,
      phoneNormalized: person.phoneNormalized,
      districtId: person.districtId,
      hasPrayerRequest: Boolean(person.prayerRequest),
    },
    metadata: {
      ministryId: input.ministryId,
      networkId: input.networkId,
      source: "internal_form",
    },
  });

  return { personId: person.id };
}

export async function createPersonPublic(
  raw: PublicGanarInput,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ ok: true }> {
  const input = publicGanarInputSchema.parse(raw);
  const ipHash = meta.ip ? hashValue(meta.ip) : null;
  const uaHash = meta.userAgent ? hashValue(meta.userAgent) : null;
  const db = getDb();

  if (ipHash) {
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const [{ c }] = await db
      .select({ c: count() })
      .from(personIntakeEvents)
      .where(
        and(
          eq(personIntakeEvents.ipHash, ipHash),
          eq(personIntakeEvents.source, "public_form"),
          gte(personIntakeEvents.createdAt, since),
        ),
      );
    if (Number(c) >= 10) {
      await db.insert(personIntakeEvents).values({
        source: "public_form",
        outcome: "rate_limited",
        ipHash,
        userAgentHash: uaHash,
        ministryId: input.ministryId,
        networkId: input.networkId,
      });
      return { ok: true };
    }
  }

  try {
    await loadMinistry(input.ministryId);
  } catch {
    await db.insert(personIntakeEvents).values({
      source: "public_form",
      outcome: "rejected_ministry",
      ipHash,
      userAgentHash: uaHash,
      ministryId: input.ministryId,
      networkId: input.networkId,
    });
    return { ok: true };
  }

  const network = await loadNetwork(input.networkId);
  try {
    assertNetworkAllowedForCapture({
      networkCode: network.code as NetworkCode,
      networkIsActive: network.isActive,
    });
  } catch {
    await db.insert(personIntakeEvents).values({
      source: "public_form",
      outcome: "rejected_network",
      ipHash,
      userAgentHash: uaHash,
      ministryId: input.ministryId,
      networkId: input.networkId,
    });
    return { ok: true };
  }

  const [district] = await db
    .select({ id: districts.id })
    .from(districts)
    .where(and(eq(districts.id, input.districtId), eq(districts.isActive, true)))
    .limit(1);
  if (!district) {
    await db.insert(personIntakeEvents).values({
      source: "public_form",
      outcome: "rejected_district",
      ipHash,
      userAgentHash: uaHash,
      ministryId: input.ministryId,
      networkId: input.networkId,
    });
    return { ok: true };
  }

  const { firstName, lastName } = splitFullName(input.fullName);
  const phoneNormalized = normalizePhone(input.phone);
  const duplicates = await findDuplicateCandidates({
    phone: input.phone,
    firstName,
    lastName,
    ministryScopeIds: null,
  });
  const strong = duplicates.find((d) => d.strength === "strong");

  if (strong) {
    await writeAuditLog({
      action: "person.possible_duplicate_detected",
      entityType: "person",
      entityId: strong.personId,
      metadata: {
        source: "public_form",
        strength: "strong",
        ministryId: input.ministryId,
        networkId: input.networkId,
        silent: true,
      },
    });
    await db.insert(personIntakeEvents).values({
      personId: strong.personId,
      source: "public_form",
      outcome: "duplicate_silent",
      ipHash,
      userAgentHash: uaHash,
      ministryId: input.ministryId,
      networkId: input.networkId,
    });
    return { ok: true };
  }

  const person = await insertPersonWithOrg({
    firstName,
    lastName,
    phone: input.phone.trim(),
    phoneNormalized,
    address: input.address.trim(),
    districtId: input.districtId,
    prayerRequest: input.prayerRequest?.trim() || null,
    email: null,
    ministryId: input.ministryId,
    networkId: input.networkId,
    source: "public_form",
    actorUserId: null,
  });

  await writeAuditLog({
    action: "person.created.public",
    entityType: "person",
    entityId: person.id,
    afterData: {
      firstName: person.firstName,
      lastName: person.lastName,
      phoneNormalized: person.phoneNormalized,
      districtId: person.districtId,
      hasPrayerRequest: Boolean(person.prayerRequest),
    },
    metadata: {
      ministryId: input.ministryId,
      networkId: input.networkId,
      source: "public_form",
    },
  });

  await db.insert(personIntakeEvents).values({
    personId: person.id,
    source: "public_form",
    outcome: "created",
    ipHash,
    userAgentHash: uaHash,
    ministryId: input.ministryId,
    networkId: input.networkId,
  });

  return { ok: true };
}

export type PersonListFilters = {
  q?: string;
  ministryId?: string;
  networkId?: string;
  districtId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

function emptyStats() {
  return {
    total: 0,
    week: 0,
    month: 0,
    byNetwork: [] as { networkId: string; count: number }[],
  };
}

export async function listPersonsForActor(
  actorUserId: string,
  filters: PersonListFilters = {},
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "persons.read", { type: "person" });

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const db = getDb();
  const conditions = [isNull(persons.deletedAt)];

  if (!isSuperadmin(actor)) {
    if (actor.ministryIds.length === 0) {
      return { rows: [], total: 0, page, pageSize, stats: emptyStats() };
    }
    conditions.push(
      sql`${personOrganizationHistory.ministryId} in (${sql.join(
        actor.ministryIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }

  if (filters.ministryId) {
    if (!canAccessMinistry(actor, filters.ministryId) && !isSuperadmin(actor)) {
      throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Ministerio fuera de alcance.");
    }
    conditions.push(eq(personOrganizationHistory.ministryId, filters.ministryId));
  }

  if (filters.networkId) {
    conditions.push(eq(personOrganizationHistory.networkId, filters.networkId));
  }

  if (filters.districtId) {
    conditions.push(eq(persons.districtId, filters.districtId));
  }
  if (filters.from) {
    conditions.push(gte(persons.registeredAt, new Date(filters.from)));
  }
  if (filters.to) {
    conditions.push(sql`${persons.registeredAt} <= ${new Date(filters.to)}`);
  }
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    const qDigits = normalizePhone(filters.q) ?? filters.q.trim();
    conditions.push(
      or(
        ilike(persons.firstName, q),
        ilike(persons.lastName, q),
        ilike(persons.phone, q),
        ilike(persons.phoneNormalized, `%${qDigits}%`),
        sql`concat(${persons.firstName}, ' ', ${persons.lastName}) ilike ${q}`,
      )!,
    );
  }

  const whereExpr = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(persons)
    .innerJoin(
      personOrganizationHistory,
      and(
        eq(personOrganizationHistory.personId, persons.id),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .where(whereExpr);

  const rows = await db
    .select({
      id: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      phone: persons.phone,
      districtId: persons.districtId,
      hasPrayerRequest: sql<boolean>`(${persons.prayerRequest} is not null and length(trim(${persons.prayerRequest})) > 0)`,
      registeredAt: persons.registeredAt,
      source: persons.source,
      ministryId: personOrganizationHistory.ministryId,
      networkId: personOrganizationHistory.networkId,
      ministryName: ministries.name,
      networkName: networks.name,
      districtName: districts.name,
    })
    .from(persons)
    .innerJoin(
      personOrganizationHistory,
      and(
        eq(personOrganizationHistory.personId, persons.id),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .innerJoin(ministries, eq(personOrganizationHistory.ministryId, ministries.id))
    .innerJoin(networks, eq(personOrganizationHistory.networkId, networks.id))
    .leftJoin(districts, eq(persons.districtId, districts.id))
    .where(whereExpr)
    .orderBy(desc(persons.registeredAt))
    .limit(pageSize)
    .offset(offset);

  return {
    rows: rows.map((row) => ({
      ...row,
      fullName: formatFullName(row.firstName, row.lastName),
    })),
    total: Number(total),
    page,
    pageSize,
    stats: await computeStats(actor),
  };
}

async function computeStats(actor: AuthContext) {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const scopeConditions = [isNull(persons.deletedAt)];
  if (!isSuperadmin(actor)) {
    if (actor.ministryIds.length === 0) {
      return emptyStats();
    }
    scopeConditions.push(
      sql`${personOrganizationHistory.ministryId} in (${sql.join(
        actor.ministryIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
  const scopeWhere = and(...scopeConditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(persons)
    .innerJoin(
      personOrganizationHistory,
      and(
        eq(personOrganizationHistory.personId, persons.id),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .where(scopeWhere);
  const [{ week }] = await db
    .select({ week: count() })
    .from(persons)
    .innerJoin(
      personOrganizationHistory,
      and(
        eq(personOrganizationHistory.personId, persons.id),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .where(and(scopeWhere, gte(persons.registeredAt, weekAgo)));
  const [{ month }] = await db
    .select({ month: count() })
    .from(persons)
    .innerJoin(
      personOrganizationHistory,
      and(
        eq(personOrganizationHistory.personId, persons.id),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .where(and(scopeWhere, gte(persons.registeredAt, monthAgo)));

  const byNetwork = await db
    .select({
      networkId: personOrganizationHistory.networkId,
      c: count(),
    })
    .from(persons)
    .innerJoin(
      personOrganizationHistory,
      and(
        eq(personOrganizationHistory.personId, persons.id),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .where(scopeWhere)
    .groupBy(personOrganizationHistory.networkId);

  return {
    total: Number(total),
    week: Number(week),
    month: Number(month),
    byNetwork: byNetwork
      .filter((r) => r.networkId)
      .map((r) => ({ networkId: r.networkId as string, count: Number(r.c) })),
  };
}

export async function getPersonForActor(actorUserId: string, personId: string) {
  const actor = await requireActor(actorUserId);
  const db = getDb();
  const [person] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, personId), isNull(persons.deletedAt)))
    .limit(1);
  if (!person) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Persona no encontrada.");
  }

  const org = await currentOrg(personId);
  assertCanView(actor, {
    type: "person",
    id: personId,
    ministryId: org?.ministryId ?? undefined,
  });

  if (
    !isSuperadmin(actor) &&
    (!org?.ministryId || !canAccessMinistry(actor, org.ministryId))
  ) {
    throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Persona fuera de alcance.");
  }

  const history = await db
    .select({
      id: personOrganizationHistory.id,
      ministryId: personOrganizationHistory.ministryId,
      networkId: personOrganizationHistory.networkId,
      effectiveFrom: personOrganizationHistory.effectiveFrom,
      effectiveTo: personOrganizationHistory.effectiveTo,
      changeReason: personOrganizationHistory.changeReason,
    })
    .from(personOrganizationHistory)
    .where(eq(personOrganizationHistory.personId, personId))
    .orderBy(desc(personOrganizationHistory.effectiveFrom));

  const [district] = person.districtId
    ? await db.select().from(districts).where(eq(districts.id, person.districtId)).limit(1)
    : [null];

  return {
    person: {
      ...person,
      fullName: formatFullName(person.firstName, person.lastName),
    },
    current: org,
    history,
    district,
  };
}

export async function updatePersonForActor(
  actorUserId: string,
  personId: string,
  patch: Partial<{
    fullName: string;
    phone: string;
    address: string;
    districtId: string;
    prayerRequest: string;
    email: string;
  }>,
) {
  const detail = await getPersonForActor(actorUserId, personId);
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "persons.write", {
    type: "person",
    id: personId,
    ministryId: detail.current?.ministryId ?? undefined,
  });

  if (
    !isSuperadmin(actor) &&
    detail.current?.ministryId &&
    !canAccessMinistry(actor, detail.current.ministryId)
  ) {
    throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Edición cross-ministry bloqueada.");
  }

  const db = getDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.fullName) {
    const parts = splitFullName(patch.fullName);
    updates.firstName = parts.firstName;
    updates.lastName = parts.lastName;
  }
  if (patch.phone !== undefined) {
    updates.phone = patch.phone.trim();
    updates.phoneNormalized = normalizePhone(patch.phone);
  }
  if (patch.address !== undefined) updates.address = patch.address.trim();
  if (patch.districtId !== undefined) updates.districtId = patch.districtId;
  if (patch.prayerRequest !== undefined) {
    updates.prayerRequest = patch.prayerRequest.trim() || null;
  }
  if (patch.email !== undefined) updates.email = patch.email.trim() || null;

  const [after] = await db
    .update(persons)
    .set(updates)
    .where(eq(persons.id, personId))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "person.updated",
    entityType: "person",
    entityId: personId,
    beforeData: {
      firstName: detail.person.firstName,
      lastName: detail.person.lastName,
      phoneNormalized: detail.person.phoneNormalized,
      districtId: detail.person.districtId,
      hasPrayerRequest: Boolean(detail.person.prayerRequest),
    },
    afterData: {
      firstName: after.firstName,
      lastName: after.lastName,
      phoneNormalized: after.phoneNormalized,
      districtId: after.districtId,
      hasPrayerRequest: Boolean(after.prayerRequest),
    },
    metadata: {
      ministryId: detail.current?.ministryId ?? null,
      networkId: detail.current?.networkId ?? null,
    },
  });

  return after;
}

export async function listCatalogsForGanar(
  actorUserId: string | null,
  opts?: { ministryId?: string; networkId?: string; publicMode?: boolean },
) {
  const db = getDb();
  const districtRows = await db
    .select({ id: districts.id, name: districts.name })
    .from(districts)
    .where(eq(districts.isActive, true))
    .orderBy(asc(districts.name));

  const networkRows = await db
    .select({
      id: networks.id,
      code: networks.code,
      name: networks.name,
      isActive: networks.isActive,
    })
    .from(networks)
    .orderBy(asc(networks.sortOrder));

  let activeNetworks = networkRows.filter((n) => n.isActive && n.code !== "ninos");
  if (opts?.networkId) {
    activeNetworks = activeNetworks.filter((n) => n.id === opts.networkId);
  }

  let ministryRows = await db
    .select({
      id: ministries.id,
      code: ministries.code,
      name: ministries.name,
      isActive: ministries.isActive,
    })
    .from(ministries)
    .where(eq(ministries.isActive, true))
    .orderBy(asc(ministries.sortOrder), asc(ministries.code));

  if (opts?.publicMode) {
    if (opts.ministryId) {
      ministryRows = ministryRows.filter((m) => m.id === opts.ministryId);
    }
    return {
      districts: districtRows,
      networks: activeNetworks,
      ministries: ministryRows,
    };
  }

  if (!actorUserId) {
    throw new DomainError(DomainErrorCode.UNAUTHENTICATED, "Sesión requerida.");
  }
  const actor = await requireActor(actorUserId);
  if (!isSuperadmin(actor)) {
    ministryRows = ministryRows.filter((m) => actor.ministryIds.includes(m.id));
  }

  return {
    districts: districtRows,
    networks: activeNetworks,
    ministries: ministryRows,
  };
}

export async function getMinistryNetworkMaps() {
  const db = getDb();
  const [mins, nets] = await Promise.all([
    db.select({ id: ministries.id, code: ministries.code, name: ministries.name }).from(ministries),
    db.select({ id: networks.id, code: networks.code, name: networks.name }).from(networks),
  ]);
  return {
    ministryById: Object.fromEntries(mins.map((m) => [m.id, m])),
    networkById: Object.fromEntries(nets.map((n) => [n.id, n])),
  };
}

/**
 * Resolve public share-link context. Query params are hints only;
 * invalid values are ignored (never trusted as authority).
 */
export async function resolvePublicFormContext(params: {
  ministry?: string | null;
  network?: string | null;
}) {
  const db = getDb();
  let ministryId: string | null = null;
  let networkId: string | null = null;
  let ministryCode: string | null = null;
  let networkCode: string | null = null;

  if (params.ministry?.trim()) {
    const raw = params.ministry.trim();
    const looksUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        raw,
      );
    if (looksUuid) {
      const [byId] = await db
        .select({ id: ministries.id, code: ministries.code })
        .from(ministries)
        .where(and(eq(ministries.isActive, true), eq(ministries.id, raw)))
        .limit(1);
      if (byId) {
        ministryId = byId.id;
        ministryCode = byId.code;
      }
    } else {
      const [byCode] = await db
        .select({ id: ministries.id, code: ministries.code })
        .from(ministries)
        .where(and(eq(ministries.isActive, true), eq(ministries.code, raw.toUpperCase())))
        .limit(1);
      if (byCode) {
        ministryId = byCode.id;
        ministryCode = byCode.code;
      }
    }
  }

  if (params.network?.trim()) {
    const raw = params.network.trim();
    const looksUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        raw,
      );
    let candidate:
      | { id: string; code: string; isActive: boolean }
      | undefined;

    if (looksUuid) {
      const [byId] = await db
        .select({ id: networks.id, code: networks.code, isActive: networks.isActive })
        .from(networks)
        .where(eq(networks.id, raw))
        .limit(1);
      candidate = byId;
    } else {
      const [byCode] = await db
        .select({ id: networks.id, code: networks.code, isActive: networks.isActive })
        .from(networks)
        .where(eq(networks.code, raw.toLowerCase() as NetworkCode))
        .limit(1);
      candidate = byCode;
    }

    if (candidate && candidate.isActive && candidate.code !== "ninos") {
      networkId = candidate.id;
      networkCode = candidate.code;
    }
  }

  return { ministryId, networkId, ministryCode, networkCode };
}
