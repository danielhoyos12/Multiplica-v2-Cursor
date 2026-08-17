import { createHash } from "node:crypto";

import type { Id } from "../../../convex/_generated/dataModel";
import { mapConvexError } from "@/lib/convex-errors";
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
import { api, getConvexHttpClient } from "@/server/convex";

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

async function listNetworks() {
  const client = getConvexHttpClient();
  return client.query(api.organization.listNetworks, {});
}

async function listMinistries() {
  const client = getConvexHttpClient();
  return client.query(api.organization.listMinistries, {});
}

async function loadNetwork(networkId: string) {
  const networks = await listNetworks();
  const row = networks.find((n) => (n._id as string) === networkId);
  if (!row) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Red no encontrada.");
  }
  return row;
}

async function loadMinistry(ministryId: string) {
  const client = getConvexHttpClient();
  const row = await client.query(api.organization.getMinistry, {
    ministryId: ministryId as Id<"ministries">,
  });
  if (!row || !row.isActive) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no disponible.");
  }
  return row;
}

async function dbNetworksForActor(actor: AuthContext) {
  if (actor.networkIds.length === 0) {
    return [] as { id: string; code: string }[];
  }
  const networks = await listNetworks();
  return networks
    .filter((n) => actor.networkIds.includes(n._id as string))
    .map((n) => ({ id: n._id as string, code: n.code as string }));
}

async function currentOrg(personId: string) {
  const client = getConvexHttpClient();
  const org = await client.query(api.persons.getCurrentOrg, {
    personId: personId as Id<"persons">,
  });
  if (!org) return null;
  return {
    ministryId: (org.ministryId as string | undefined) ?? null,
    networkId: (org.networkId as string | undefined) ?? null,
    effectiveFrom: new Date(org.effectiveFrom),
  };
}

async function assertDistrictActive(districtId: string) {
  const client = getConvexHttpClient();
  const districts = await client.query(api.foundation.listActiveDistricts, {});
  const found = districts.some((d) => (d._id as string) === districtId);
  if (!found) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Distrito no disponible.");
  }
}

export async function findDuplicateCandidates(params: {
  phone: string;
  firstName: string;
  lastName: string;
  ministryScopeIds?: string[] | null;
}): Promise<DuplicateMatch[]> {
  const phoneNormalized = normalizePhone(params.phone);
  if (!phoneNormalized) return [];

  const client = getConvexHttpClient();
  const rows = await client.query(api.persons.findDuplicateCandidates, {
    phoneNormalized,
    limit: 20,
  });

  const matches: DuplicateMatch[] = [];
  for (const row of rows) {
    const org = await currentOrg(row._id as string);
    if (
      params.ministryScopeIds &&
      params.ministryScopeIds.length > 0 &&
      org?.ministryId &&
      !params.ministryScopeIds.includes(org.ministryId)
    ) {
      continue;
    }

    const strong = phonesMatchStrong(row.phoneNormalized ?? null, phoneNormalized);
    const possible =
      !strong &&
      namesLookSimilar(params.firstName, params.lastName, row.firstName, row.lastName);

    if (strong || possible) {
      matches.push({
        strength: strong ? "strong" : "possible",
        personId: row._id as string,
        fullName: formatFullName(row.firstName, row.lastName),
        phone: row.phone ?? null,
        ministryId: org?.ministryId ?? null,
      });
    }
  }

  return matches.sort((left, right) => {
    if (left.strength === right.strength) return 0;
    return left.strength === "strong" ? -1 : 1;
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

  const actorNetworkCodes = (await dbNetworksForActor(actor)).map((n) => n.code as NetworkCode);
  assertActorMayCaptureNetwork(actorNetworkCodes, network.code as NetworkCode);

  await assertDistrictActive(input.districtId);

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

  const client = getConvexHttpClient();
  const person = await client
    .mutation(api.persons.createInternal, {
      firstName,
      lastName,
      phone: input.phone.trim(),
      address: input.address.trim(),
      districtId: input.districtId as Id<"districts">,
      prayerRequest: input.prayerRequest?.trim() || undefined,
      email: input.email?.trim() || undefined,
      ministryId: input.ministryId as Id<"ministries">,
      networkId: input.networkId as Id<"networks">,
      createdByUserId: actorUserId as Id<"users">,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "person.created.internal",
    entityType: "person",
    entityId: person._id,
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

  return { personId: person._id as string };
}

export async function createPersonPublic(
  raw: PublicGanarInput,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ ok: true }> {
  const input = publicGanarInputSchema.parse(raw);
  const ipHash = meta.ip ? hashValue(meta.ip) : null;
  const uaHash = meta.userAgent ? hashValue(meta.userAgent) : null;
  const client = getConvexHttpClient();

  const recordEvent = async (outcome: string, personId?: string) => {
    await client.mutation(api.persons.recordIntakeEvent, {
      personId: personId ? (personId as Id<"persons">) : undefined,
      ministryId: input.ministryId as Id<"ministries">,
      networkId: input.networkId as Id<"networks">,
      source: "public_form",
      outcome,
      ipHash: ipHash ?? undefined,
      userAgentHash: uaHash ?? undefined,
    });
  };

  if (ipHash) {
    const since = Date.now() - 10 * 60 * 1000;
    const count = await client.query(api.persons.countRecentIntakeEvents, {
      ipHash,
      source: "public_form",
      sinceMs: since,
    });
    if (count >= 10) {
      await recordEvent("rate_limited");
      return { ok: true };
    }
  }

  try {
    await loadMinistry(input.ministryId);
  } catch {
    await recordEvent("rejected_ministry");
    return { ok: true };
  }

  const network = await loadNetwork(input.networkId);
  try {
    assertNetworkAllowedForCapture({
      networkCode: network.code as NetworkCode,
      networkIsActive: network.isActive,
    });
  } catch {
    await recordEvent("rejected_network");
    return { ok: true };
  }

  try {
    await assertDistrictActive(input.districtId);
  } catch {
    await recordEvent("rejected_district");
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
    await recordEvent("duplicate_silent", strong.personId);
    return { ok: true };
  }

  // `persons.createPublic` creates the person + org row and logs the
  // "created" intake event atomically — no separate `recordIntakeEvent` call.
  await client
    .mutation(api.persons.createPublic, {
      firstName,
      lastName,
      phone: input.phone.trim(),
      address: input.address.trim(),
      districtId: input.districtId as Id<"districts">,
      prayerRequest: input.prayerRequest?.trim() || undefined,
      ministryId: input.ministryId as Id<"ministries">,
      networkId: input.networkId as Id<"networks">,
      ipHash: ipHash ?? undefined,
      userAgentHash: uaHash ?? undefined,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    action: "person.created.public",
    entityType: "person",
    afterData: {
      firstName,
      lastName,
      phoneNormalized,
      districtId: input.districtId,
    },
    metadata: {
      ministryId: input.ministryId,
      networkId: input.networkId,
      source: "public_form",
    },
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

type ActivePersonRow = {
  _id: Id<"persons">;
  firstName: string;
  lastName: string;
  phone?: string;
  phoneNormalized?: string;
  email?: string;
  districtId?: Id<"districts">;
  prayerRequest?: string;
  source: "internal_form" | "public_form";
  registeredAt: number;
  ministryId: Id<"ministries">;
  networkId: Id<"networks">;
};

async function scopedActiveRows(actor: AuthContext): Promise<ActivePersonRow[]> {
  const client = getConvexHttpClient();
  const rows = await client.query(api.persons.listActiveWithOrg, {});
  if (isSuperadmin(actor)) return rows;
  if (actor.ministryIds.length === 0) return [];
  return rows.filter((r) => actor.ministryIds.includes(r.ministryId as string));
}

export async function listPersonsForActor(
  actorUserId: string,
  filters: PersonListFilters = {},
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "persons.read", { type: "person" });

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));

  if (filters.ministryId && !canAccessMinistry(actor, filters.ministryId) && !isSuperadmin(actor)) {
    throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Ministerio fuera de alcance.");
  }

  const scoped = await scopedActiveRows(actor);
  if (scoped.length === 0 && actor.ministryIds.length === 0 && !isSuperadmin(actor)) {
    return { rows: [], total: 0, page, pageSize, stats: emptyStats() };
  }

  let filtered = scoped;
  if (filters.ministryId) {
    filtered = filtered.filter((r) => (r.ministryId as string) === filters.ministryId);
  }
  if (filters.networkId) {
    filtered = filtered.filter((r) => (r.networkId as string) === filters.networkId);
  }
  if (filters.districtId) {
    filtered = filtered.filter((r) => (r.districtId as string | undefined) === filters.districtId);
  }
  if (filters.from) {
    const fromMs = new Date(filters.from).getTime();
    filtered = filtered.filter((r) => r.registeredAt >= fromMs);
  }
  if (filters.to) {
    const toMs = new Date(filters.to).getTime();
    filtered = filtered.filter((r) => r.registeredAt <= toMs);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    const qDigits = normalizePhone(filters.q) ?? filters.q.trim();
    filtered = filtered.filter((r) => {
      const fullName = `${r.firstName} ${r.lastName}`.toLowerCase();
      return (
        r.firstName.toLowerCase().includes(q) ||
        r.lastName.toLowerCase().includes(q) ||
        fullName.includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.phoneNormalized ?? "").includes(qDigits)
      );
    });
  }

  filtered = [...filtered].sort((a, b) => b.registeredAt - a.registeredAt);
  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const pageRows = filtered.slice(offset, offset + pageSize);

  const [{ ministryById, networkById }] = await Promise.all([getMinistryNetworkMaps()]);
  const client = getConvexHttpClient();
  const districts = await client.query(api.foundation.listActiveDistricts, {});
  const districtById = Object.fromEntries(districts.map((d) => [d._id as string, d]));

  const rows = pageRows.map((row) => ({
    id: row._id as string,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: formatFullName(row.firstName, row.lastName),
    phone: row.phone ?? null,
    districtId: (row.districtId as string | undefined) ?? null,
    hasPrayerRequest: Boolean(row.prayerRequest?.trim()),
    registeredAt: new Date(row.registeredAt),
    source: row.source,
    ministryId: row.ministryId as string,
    networkId: row.networkId as string,
    ministryName: ministryById[row.ministryId as string]?.name ?? null,
    networkName: networkById[row.networkId as string]?.name ?? null,
    districtName: row.districtId ? districtById[row.districtId as string]?.name ?? null : null,
  }));

  return {
    rows,
    total,
    page,
    pageSize,
    stats: computeStats(scoped),
  };
}

function computeStats(scoped: ActivePersonRow[]) {
  if (scoped.length === 0) return emptyStats();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const byNetwork = new Map<string, number>();
  let week = 0;
  let month = 0;
  for (const row of scoped) {
    const networkId = row.networkId as string;
    byNetwork.set(networkId, (byNetwork.get(networkId) ?? 0) + 1);
    if (row.registeredAt >= weekAgo) week += 1;
    if (row.registeredAt >= monthAgo) month += 1;
  }

  return {
    total: scoped.length,
    week,
    month,
    byNetwork: [...byNetwork.entries()].map(([networkId, count]) => ({ networkId, count })),
  };
}

export async function getPersonForActor(actorUserId: string, personId: string) {
  const actor = await requireActor(actorUserId);
  const client = getConvexHttpClient();
  const person = await client.query(api.persons.getById, {
    personId: personId as Id<"persons">,
  });
  if (!person) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Persona no encontrada.");
  }

  const org = await currentOrg(personId);
  assertCanView(actor, {
    type: "person",
    id: personId,
    ministryId: org?.ministryId ?? undefined,
  });

  if (!isSuperadmin(actor) && (!org?.ministryId || !canAccessMinistry(actor, org.ministryId))) {
    throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Persona fuera de alcance.");
  }

  const historyRows = await client.query(api.persons.getOrgHistory, {
    personId: personId as Id<"persons">,
  });
  const history = historyRows.map((row) => ({
    id: row._id as string,
    ministryId: (row.ministryId as string | undefined) ?? null,
    networkId: (row.networkId as string | undefined) ?? null,
    effectiveFrom: new Date(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? new Date(row.effectiveTo) : null,
    changeReason: row.changeReason ?? null,
  }));

  let district: { id: string; name: string } | null = null;
  if (person.districtId) {
    const districts = await client.query(api.foundation.listActiveDistricts, {});
    const found = districts.find((d) => (d._id as string) === (person.districtId as string));
    district = found ? { id: found._id as string, name: found.name } : null;
  }

  return {
    person: {
      id: person._id as string,
      firstName: person.firstName,
      lastName: person.lastName,
      fullName: formatFullName(person.firstName, person.lastName),
      phone: person.phone ?? null,
      email: person.email ?? null,
      address: person.address ?? null,
      districtId: (person.districtId as string | undefined) ?? null,
      prayerRequest: person.prayerRequest ?? null,
      source: person.source,
      isActive: person.isActive,
      registeredAt: new Date(person.registeredAt),
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

  const client = getConvexHttpClient();
  let firstName: string | undefined;
  let lastName: string | undefined;
  if (patch.fullName) {
    const parts = splitFullName(patch.fullName);
    firstName = parts.firstName;
    lastName = parts.lastName;
  }

  const after = await client
    .mutation(api.persons.update, {
      personId: personId as Id<"persons">,
      firstName,
      lastName,
      phone: patch.phone !== undefined ? patch.phone.trim() : undefined,
      address: patch.address !== undefined ? patch.address.trim() : undefined,
      districtId: patch.districtId !== undefined ? (patch.districtId as Id<"districts">) : undefined,
      prayerRequest: patch.prayerRequest !== undefined ? patch.prayerRequest.trim() : undefined,
      email: patch.email !== undefined ? patch.email.trim() : undefined,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "person.updated",
    entityType: "person",
    entityId: personId,
    beforeData: {
      firstName: detail.person.firstName,
      lastName: detail.person.lastName,
      districtId: detail.person.districtId,
      hasPrayerRequest: Boolean(detail.person.prayerRequest),
    },
    afterData: {
      firstName: after.firstName,
      lastName: after.lastName,
      districtId: after.districtId,
      hasPrayerRequest: Boolean(after.prayerRequest),
    },
    metadata: {
      ministryId: detail.current?.ministryId ?? null,
      networkId: detail.current?.networkId ?? null,
    },
  });

  return {
    ...after,
    id: after._id as string,
  };
}

export async function listCatalogsForGanar(
  actorUserId: string | null,
  opts?: { ministryId?: string; networkId?: string; publicMode?: boolean },
) {
  const client = getConvexHttpClient();
  const [districtRows, networkRows, allMinistryRows] = await Promise.all([
    client.query(api.foundation.listActiveDistricts, {}),
    listNetworks(),
    listMinistries(),
  ]);

  const districts = [...districtRows]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ id: d._id as string, name: d.name }));

  let activeNetworks = networkRows
    .filter((n) => n.isActive && n.code !== "ninos")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((n) => ({ id: n._id as string, code: n.code as string, name: n.name, isActive: n.isActive }));
  if (opts?.networkId) {
    activeNetworks = activeNetworks.filter((n) => n.id === opts.networkId);
  }

  let ministryRows = allMinistryRows
    .filter((m) => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((m) => ({ id: m._id as string, code: m.code, name: m.name, isActive: m.isActive }));

  if (opts?.publicMode) {
    if (opts.ministryId) {
      ministryRows = ministryRows.filter((m) => m.id === opts.ministryId);
    }
    return {
      districts,
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
    districts,
    networks: activeNetworks,
    ministries: ministryRows,
  };
}

export async function getMinistryNetworkMaps() {
  const [ministries, networks] = await Promise.all([listMinistries(), listNetworks()]);
  return {
    ministryById: Object.fromEntries(
      ministries.map((m) => [m._id as string, { id: m._id as string, code: m.code, name: m.name }]),
    ),
    networkById: Object.fromEntries(
      networks.map((n) => [n._id as string, { id: n._id as string, code: n.code as string, name: n.name }]),
    ),
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
  let ministryId: string | null = null;
  let networkId: string | null = null;
  let ministryCode: string | null = null;
  let networkCode: string | null = null;

  if (params.ministry?.trim()) {
    const raw = params.ministry.trim();
    const ministries = await listMinistries();
    const found = ministries.find(
      (m) => m.isActive && ((m._id as string) === raw || m.code.toUpperCase() === raw.toUpperCase()),
    );
    if (found) {
      ministryId = found._id as string;
      ministryCode = found.code;
    }
  }

  if (params.network?.trim()) {
    const raw = params.network.trim();
    const networks = await listNetworks();
    const found = networks.find(
      (n) =>
        n.isActive &&
        n.code !== "ninos" &&
        ((n._id as string) === raw || (n.code as string).toLowerCase() === raw.toLowerCase()),
    );
    if (found) {
      networkId = found._id as string;
      networkCode = found.code as string;
    }
  }

  return { ministryId, networkId, ministryCode, networkCode };
}
