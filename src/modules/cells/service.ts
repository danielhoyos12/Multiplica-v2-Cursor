import type { Id } from "../../../convex/_generated/dataModel";
import { mapConvexError } from "@/lib/convex-errors";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { writeAuditLog } from "@/modules/audit";
import {
  assertCanMutate,
  assertCanView,
  canAccessMinistry,
  canJoinCellNetwork,
  canManageNetwork,
  isSuperadmin,
  loadAuthContext,
  type AuthContext,
  type NetworkCode,
} from "@/modules/authorization";
import { formatFullName } from "@/modules/ganar/normalize";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

import { formatCellSchedule, type DayOfWeek } from "./schedule";
import {
  createCellInputSchema,
  saveAttendanceInputSchema,
  updateCellInputSchema,
  type CreateCellInput,
  type SaveAttendanceInput,
  type UpdateCellInput,
} from "./validation";

async function requireActor(userId: string): Promise<AuthContext> {
  return loadAuthContext(userId);
}

async function listNetworks() {
  const client = await getAuthenticatedConvexClient();
  return client.query(api.organization.listNetworks, {});
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
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.organization.getMinistry, {
    ministryId: ministryId as Id<"ministries">,
  });
  if (!row || !row.isActive) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no disponible.");
  }
  return row;
}

async function currentPersonOrg(personId: string) {
  const client = await getAuthenticatedConvexClient();
  const org = await client.query(api.persons.getCurrentOrg, {
    personId: personId as Id<"persons">,
  });
  if (!org) return null;
  return {
    ministryId: (org.ministryId as string | undefined) ?? null,
    networkId: (org.networkId as string | undefined) ?? null,
  };
}

async function getCellOrThrow(cellId: string) {
  const client = await getAuthenticatedConvexClient();
  const row = await client.query(api.cells.getById, { cellId: cellId as Id<"cells"> });
  if (!row) {
    throw new DomainError(DomainErrorCode.CELL_NOT_FOUND, "Célula no encontrada.");
  }
  return row;
}

function assertCellReadable(actor: AuthContext, ministryId: string) {
  assertCanView(actor, { type: "cell", ministryId });
  if (!canAccessMinistry(actor, ministryId) && !isSuperadmin(actor)) {
    throw new DomainError(DomainErrorCode.CELL_NOT_AUTHORIZED, "Célula fuera de alcance.");
  }
}

async function assertNetworkActiveForCapture(networkId: string) {
  const network = await loadNetwork(networkId);
  if (!network.isActive || network.code === "ninos") {
    throw new DomainError(
      DomainErrorCode.NETWORK_INACTIVE,
      "La Red seleccionada no está disponible.",
      { networkCode: network.code },
    );
  }
  return network;
}

async function countActiveCellsForResponsible(
  responsiblePersonId: string,
  excludeCellId?: string,
) {
  const client = await getAuthenticatedConvexClient();
  const rows = await client.query(api.cells.listByResponsible, {
    responsiblePersonId: responsiblePersonId as Id<"persons">,
  });
  return rows
    .filter((c) => c.status !== "closed" && (c._id as string) !== excludeCellId)
    .map((c) => ({ id: c._id as string, type: c.type }));
}

async function assertResponsibleCapacity(
  responsiblePersonId: string,
  cellType: "evangelistic" | "twelve",
  excludeCellId?: string,
) {
  const existing = await countActiveCellsForResponsible(responsiblePersonId, excludeCellId);
  const sameType = existing.find((c) => c.type === cellType);
  if (sameType) {
    throw new DomainError(
      DomainErrorCode.MAX_DIRECT_CELLS_REACHED,
      "El responsable ya tiene una célula directa de este tipo (máx. 1 evangelística + 1 de 12).",
    );
  }
  if (existing.length >= 2) {
    throw new DomainError(
      DomainErrorCode.MAX_DIRECT_CELLS_REACHED,
      "El responsable ya alcanzó el máximo de dos células directas.",
    );
  }
}

async function assertResponsibleNetworkCompat(
  responsiblePersonId: string,
  cellNetworkCode: NetworkCode,
) {
  const org = await currentPersonOrg(responsiblePersonId);
  if (!org?.networkId) {
    throw new DomainError(
      DomainErrorCode.PERSON_NETWORK_INCOMPATIBLE,
      "El responsable no tiene pertenencia organizacional actual.",
    );
  }
  const network = await loadNetwork(org.networkId);
  if (!canManageNetwork(network.code as NetworkCode, cellNetworkCode)) {
    throw new DomainError(
      DomainErrorCode.CELL_NETWORK_INCOMPATIBLE,
      "El responsable no es compatible con la Red de la célula.",
    );
  }
}

function toCellRecord(cell: {
  _id: Id<"cells">;
  code?: string;
  name: string;
  type: "evangelistic" | "twelve";
  ministryId: Id<"ministries">;
  networkId: Id<"networks">;
  responsiblePersonId?: Id<"persons">;
  responsibleUserId?: Id<"users">;
  dayOfWeek?: string;
  startTime?: string;
  timezone: string;
  address?: string;
  districtId?: Id<"districts">;
  status: "active" | "inactive" | "closed";
  openedAt: number;
  closedAt?: number;
}) {
  return {
    ...cell,
    id: cell._id as string,
    code: cell.code ?? null,
    ministryId: cell.ministryId as string,
    networkId: cell.networkId as string,
    responsiblePersonId: (cell.responsiblePersonId as string | undefined) ?? null,
    districtId: (cell.districtId as string | undefined) ?? null,
    dayOfWeek: cell.dayOfWeek ?? null,
    startTime: cell.startTime ?? null,
    address: cell.address ?? null,
  };
}

export async function createCell(actorUserId: string, raw: CreateCellInput) {
  const actor = await requireActor(actorUserId);
  const input = createCellInputSchema.parse(raw);

  assertCanMutate(actor, "cells.create", {
    type: "cell",
    ministryId: input.ministryId,
  });

  await loadMinistry(input.ministryId);
  const network = await assertNetworkActiveForCapture(input.networkId);

  if (input.type === "twelve" && !isSuperadmin(actor)) {
    throw new DomainError(
      DomainErrorCode.NOT_AUTHORIZED,
      "La Célula de 12 se crea por conversión pastoral (g12.convert_twelve), no por alta directa.",
    );
  }

  if (input.responsiblePersonId) {
    await assertResponsibleCapacity(input.responsiblePersonId, input.type);
    await assertResponsibleNetworkCompat(
      input.responsiblePersonId,
      network.code as NetworkCode,
    );
    const org = await currentPersonOrg(input.responsiblePersonId);
    if (!org?.ministryId || org.ministryId !== input.ministryId) {
      throw new DomainError(
        DomainErrorCode.CELL_NOT_AUTHORIZED,
        "El responsable debe pertenecer al mismo Ministerio.",
      );
    }
  }

  const client = await getAuthenticatedConvexClient();
  const cell = await client
    .mutation(api.cells.create, {
      name: input.name.trim(),
      code: input.code?.trim() ? input.code.trim() : undefined,
      type: input.type,
      ministryId: input.ministryId as Id<"ministries">,
      networkId: input.networkId as Id<"networks">,
      responsiblePersonId: input.responsiblePersonId
        ? (input.responsiblePersonId as Id<"persons">)
        : undefined,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      timezone: input.timezone || "America/Lima",
      address: input.address?.trim() || undefined,
      districtId:
        input.districtId && input.districtId !== ""
          ? (input.districtId as Id<"districts">)
          : undefined,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "cell.created",
    entityType: "cell",
    entityId: cell._id,
    afterData: {
      name: cell.name,
      type: cell.type,
      ministryId: cell.ministryId,
      networkId: cell.networkId,
      dayOfWeek: cell.dayOfWeek,
      startTime: cell.startTime,
    },
    metadata: { source: "phase3" },
  });

  return toCellRecord(cell);
}

export async function updateCell(
  actorUserId: string,
  cellId: string,
  raw: UpdateCellInput,
) {
  const actor = await requireActor(actorUserId);
  const cell = await getCellOrThrow(cellId);
  assertCanMutate(actor, "cells.update", {
    type: "cell",
    id: cellId,
    ministryId: cell.ministryId as string,
  });

  if (cell.status === "closed") {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "La célula está cerrada.");
  }

  const input = updateCellInputSchema.parse(raw);

  let nextNetworkId: string | undefined;
  if (input.networkId !== undefined) {
    const network = await assertNetworkActiveForCapture(input.networkId);
    nextNetworkId = network._id as string;
  }

  if (input.responsiblePersonId !== undefined && input.responsiblePersonId) {
    await assertResponsibleCapacity(input.responsiblePersonId, cell.type, cellId);
    const effectiveNetworkId = nextNetworkId ?? (cell.networkId as string);
    const network = await loadNetwork(effectiveNetworkId);
    await assertResponsibleNetworkCompat(input.responsiblePersonId, network.code as NetworkCode);
    const org = await currentPersonOrg(input.responsiblePersonId);
    if (!org?.ministryId || org.ministryId !== (cell.ministryId as string)) {
      throw new DomainError(
        DomainErrorCode.CELL_NOT_AUTHORIZED,
        "El responsable debe pertenecer al mismo Ministerio.",
      );
    }
  }

  const client = await getAuthenticatedConvexClient();
  const after = await client
    .mutation(api.cells.update, {
      cellId: cellId as Id<"cells">,
      name: input.name !== undefined ? input.name.trim() : undefined,
      code: input.code !== undefined ? (input.code.trim() ? input.code.trim() : "") : undefined,
      networkId: input.networkId !== undefined ? (input.networkId as Id<"networks">) : undefined,
      responsiblePersonId:
        input.responsiblePersonId !== undefined
          ? input.responsiblePersonId
            ? (input.responsiblePersonId as Id<"persons">)
            : undefined
          : undefined,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      timezone: input.timezone,
      address: input.address !== undefined ? input.address.trim() || undefined : undefined,
      districtId:
        input.districtId !== undefined
          ? input.districtId && input.districtId !== ""
            ? (input.districtId as Id<"districts">)
            : undefined
          : undefined,
      status: input.status !== undefined && input.status !== "closed" ? input.status : undefined,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "cell.updated",
    entityType: "cell",
    entityId: cellId,
    beforeData: {
      name: cell.name,
      networkId: cell.networkId,
      dayOfWeek: cell.dayOfWeek,
      startTime: cell.startTime,
      status: cell.status,
    },
    afterData: {
      name: after.name,
      networkId: after.networkId,
      dayOfWeek: after.dayOfWeek,
      startTime: after.startTime,
      status: after.status,
    },
  });

  return toCellRecord(after);
}

export async function closeCell(actorUserId: string, cellId: string) {
  const actor = await requireActor(actorUserId);
  const cell = await getCellOrThrow(cellId);
  assertCanMutate(actor, "cells.update", {
    type: "cell",
    id: cellId,
    ministryId: cell.ministryId as string,
  });

  const client = await getAuthenticatedConvexClient();
  const after = await client
    .mutation(api.cells.close, { cellId: cellId as Id<"cells"> })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "cell.closed",
    entityType: "cell",
    entityId: cellId,
    metadata: { ministryId: cell.ministryId },
  });

  return toCellRecord(after);
}

/** Phase 4: real conversion lives in leadership module. */
export async function convertEvangelisticToTwelve(actorUserId: string, cellId: string) {
  const { convertEvangelisticCellToTwelve } = await import("@/modules/leadership/service");
  return convertEvangelisticCellToTwelve(actorUserId, {
    cellId,
    ordinaryMemberPersonIds: [],
  });
}

export type CellListFilters = {
  q?: string;
  ministryId?: string;
  networkId?: string;
  status?: "active" | "inactive" | "closed";
  type?: "evangelistic" | "twelve";
  page?: number;
  pageSize?: number;
};

function emptyCellStats() {
  return {
    total: 0,
    active: 0,
    evangelistic: 0,
    twelve: 0,
    recentAttendanceAvg: null as number | null,
  };
}

type CellRow = {
  _id: Id<"cells">;
  code?: string;
  name: string;
  type: "evangelistic" | "twelve";
  status: "active" | "inactive" | "closed";
  dayOfWeek?: string;
  startTime?: string;
  ministryId: Id<"ministries">;
  networkId: Id<"networks">;
  responsiblePersonId?: Id<"persons">;
};

function scopeCells(actor: AuthContext, rows: CellRow[]): CellRow[] {
  if (isSuperadmin(actor)) return rows;
  if (actor.ministryIds.length === 0) return [];
  return rows.filter((c) => actor.ministryIds.includes(c.ministryId as string));
}

async function computeCellStats(actor: AuthContext, allRows: CellRow[]) {
  const scoped = scopeCells(actor, allRows);
  const total = scoped.length;
  const active = scoped.filter((c) => c.status === "active").length;
  const evangelistic = scoped.filter((c) => c.type === "evangelistic").length;
  const twelve = scoped.filter((c) => c.type === "twelve").length;

  let recentAttendanceAvg: number | null = null;
  if (scoped.length > 0) {
    const client = await getAuthenticatedConvexClient();
    recentAttendanceAvg = await client.query(api.cells.recentAttendanceAvg, {
      cellIds: scoped.map((c) => c._id),
      limit: 20,
    });
  }

  return { total, active, evangelistic, twelve, recentAttendanceAvg };
}

export async function listCellsForActor(actorUserId: string, filters: CellListFilters = {}) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "cells.read", { type: "cell" });

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const client = await getAuthenticatedConvexClient();
  const allRows = await client.query(api.cells.listAll, {});

  if (!isSuperadmin(actor) && actor.ministryIds.length === 0) {
    return {
      rows: [],
      total: 0,
      page,
      pageSize,
      stats: emptyCellStats(),
    };
  }

  if (filters.ministryId) {
    if (!canAccessMinistry(actor, filters.ministryId) && !isSuperadmin(actor)) {
      throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Ministerio fuera de alcance.");
    }
  }

  const scoped = scopeCells(actor, allRows);
  let filtered = scoped;
  if (filters.ministryId) {
    filtered = filtered.filter((c) => (c.ministryId as string) === filters.ministryId);
  }
  if (filters.networkId) {
    filtered = filtered.filter((c) => (c.networkId as string) === filters.networkId);
  }
  if (filters.status) filtered = filtered.filter((c) => c.status === filters.status);
  if (filters.type) filtered = filtered.filter((c) => c.type === filters.type);
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    filtered = filtered.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.code ?? "").toLowerCase().includes(q),
    );
  }

  filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const total = filtered.length;
  const pageRows = filtered.slice(offset, offset + pageSize);

  const [ministries, networks, activeMemberCounts] = await Promise.all([
    client.query(api.organization.listMinistries, {}),
    client.query(api.organization.listNetworks, {}),
    client.query(api.cells.countActiveMembers, { cellIds: pageRows.map((r) => r._id) }),
  ]);
  const ministryById = new Map(ministries.map((m) => [m._id as string, m]));
  const networkById = new Map(networks.map((n) => [n._id as string, n]));
  const activeMembersById = new Map(
    activeMemberCounts.map((c) => [c.cellId as string, c.count]),
  );

  const responsibleIds = pageRows
    .map((r) => r.responsiblePersonId)
    .filter((id): id is Id<"persons"> => Boolean(id));
  const responsiblePersons =
    responsibleIds.length > 0
      ? await client.query(api.persons.getManyByIds, { personIds: responsibleIds })
      : [];
  const responsibleById = new Map(responsiblePersons.map((p) => [p._id as string, p]));

  const rows = pageRows.map((row) => {
    const ministry = ministryById.get(row.ministryId as string);
    const network = networkById.get(row.networkId as string);
    const responsible = row.responsiblePersonId
      ? responsibleById.get(row.responsiblePersonId as string)
      : undefined;
    return {
      id: row._id as string,
      code: row.code ?? null,
      name: row.name,
      type: row.type,
      status: row.status,
      dayOfWeek: row.dayOfWeek ?? null,
      startTime: row.startTime ?? null,
      ministryId: row.ministryId as string,
      ministryName: ministry?.name ?? null,
      ministryCode: ministry?.code ?? null,
      networkId: row.networkId as string,
      networkName: network?.name ?? null,
      responsiblePersonId: (row.responsiblePersonId as string | undefined) ?? null,
      responsibleName: responsible
        ? formatFullName(responsible.firstName, responsible.lastName)
        : null,
      activeMembers: activeMembersById.get(row._id as string) ?? 0,
      scheduleLabel:
        row.dayOfWeek && row.startTime
          ? formatCellSchedule(row.dayOfWeek as DayOfWeek, row.startTime)
          : "Sin horario",
    };
  });

  return {
    rows,
    total,
    page,
    pageSize,
    stats: await computeCellStats(actor, allRows),
  };
}

export async function getCellDetail(actorUserId: string, cellId: string) {
  const actor = await requireActor(actorUserId);
  const client = await getAuthenticatedConvexClient();
  const detail = await client.query(api.cells.getDetail, { cellId: cellId as Id<"cells"> });
  if (!detail) {
    throw new DomainError(DomainErrorCode.CELL_NOT_FOUND, "Célula no encontrada.");
  }
  assertCellReadable(actor, detail.cell.ministryId as string);

  const [ministry, networks, districts, responsible] = await Promise.all([
    client.query(api.organization.getMinistry, {
      ministryId: detail.cell.ministryId,
    }),
    listNetworks(),
    client.query(api.foundation.listActiveDistricts, {}),
    detail.cell.responsiblePersonId
      ? client.query(api.persons.getById, { personId: detail.cell.responsiblePersonId })
      : Promise.resolve(null),
  ]);
  const network = networks.find((n) => n._id === detail.cell.networkId) ?? null;
  const district = detail.cell.districtId
    ? districts.find((d) => d._id === detail.cell.districtId) ?? null
    : null;

  const activeMembers = detail.members.filter((m) => m.status === "active");

  let lastSessionStats: {
    sessionId: string;
    sessionDate: string;
    present: number;
    total: number;
    pct: number | null;
  } | null = null;

  const sessionIds = detail.recentSessions.map((s) => s._id);
  const counts =
    sessionIds.length > 0
      ? await client.query(api.cells.sessionAttendanceCounts, { sessionIds })
      : [];
  const countsBySession = new Map(counts.map((c) => [c.sessionId as string, c]));

  if (detail.recentSessions[0]) {
    const first = detail.recentSessions[0];
    const stats = countsBySession.get(first._id as string) ?? { present: 0, total: 0 };
    lastSessionStats = {
      sessionId: first._id as string,
      sessionDate: first.sessionDate,
      present: stats.present,
      total: stats.total,
      pct: stats.total === 0 ? null : Math.round((stats.present / stats.total) * 100),
    };
  }

  const last4 = detail.recentSessions.slice(0, 4);
  let avgLast4: number | null = null;
  if (last4.length > 0) {
    const pcts: number[] = [];
    for (const s of last4) {
      const stats = countsBySession.get(s._id as string);
      if (stats && stats.total > 0) {
        pcts.push((stats.present / stats.total) * 100);
      }
    }
    if (pcts.length) {
      avgLast4 = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    }
  }

  return {
    cell: {
      ...toCellRecord(detail.cell),
      scheduleLabel:
        detail.cell.dayOfWeek && detail.cell.startTime
          ? formatCellSchedule(detail.cell.dayOfWeek as DayOfWeek, detail.cell.startTime)
          : "Sin horario",
    },
    ministry,
    network,
    district,
    responsible: responsible
      ? {
          ...responsible,
          id: responsible._id as string,
          fullName: formatFullName(responsible.firstName, responsible.lastName),
        }
      : null,
    members: detail.members.map((m) => ({
      membershipId: m.membershipId as string,
      personId: m.personId as string,
      status: m.status,
      role: m.role,
      joinedAt: new Date(m.joinedAt),
      leftAt: m.leftAt ? new Date(m.leftAt) : null,
      firstName: m.firstName,
      lastName: m.lastName,
      phone: m.phone ?? null,
      fullName: formatFullName(m.firstName, m.lastName),
    })),
    activeMemberCount: activeMembers.length,
    lastSessionStats,
    avgLast4,
    recentSessions: detail.recentSessions.map((s) => ({
      id: s._id as string,
      sessionDate: s.sessionDate,
      status: s.status,
    })),
  };
}

export async function addMemberToCell(
  actorUserId: string,
  cellId: string,
  personId: string,
) {
  const actor = await requireActor(actorUserId);
  const cell = await getCellOrThrow(cellId);
  assertCanMutate(actor, "cells.manage_members", {
    type: "cell",
    id: cellId,
    ministryId: cell.ministryId as string,
  });

  if (cell.status === "closed") {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "La célula está cerrada.");
  }

  const client = await getAuthenticatedConvexClient();
  const person = await client.query(api.persons.getById, {
    personId: personId as Id<"persons">,
  });
  if (!person) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Persona no encontrada.");
  }

  const org = await currentPersonOrg(personId);
  if (!org?.ministryId || org.ministryId !== (cell.ministryId as string)) {
    throw new DomainError(
      DomainErrorCode.CELL_NOT_AUTHORIZED,
      "La persona no pertenece al Ministerio de la célula.",
    );
  }
  if (!org.networkId) {
    throw new DomainError(
      DomainErrorCode.PERSON_NETWORK_INCOMPATIBLE,
      "La persona no tiene Red organizacional actual.",
    );
  }

  const personNetwork = await loadNetwork(org.networkId);
  const cellNetwork = await loadNetwork(cell.networkId as string);
  if (
    !canJoinCellNetwork(
      personNetwork.code as NetworkCode,
      cellNetwork.code as NetworkCode,
    )
  ) {
    throw new DomainError(
      DomainErrorCode.PERSON_NETWORK_INCOMPATIBLE,
      "La persona no es compatible con la Red de la célula.",
    );
  }

  if (cell.type === "twelve") {
    // Ordinary people cannot join a Célula de 12
    const { countsAsTwelveLeader } = await import("@/modules/leadership/service");
    const ok = await countsAsTwelveLeader(personId);
    if (!ok) {
      throw new DomainError(
        DomainErrorCode.TWELVE_MEMBER_NOT_ACTIVE_LEADER,
        "La Célula de 12 solo admite líderes activos.",
      );
    }
  }

  const membership = await client
    .mutation(api.cells.addMember, {
      cellId: cellId as Id<"cells">,
      personId: personId as Id<"persons">,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "cell.member.added",
    entityType: "cell_membership",
    entityId: membership._id,
    metadata: { cellId, personId, ministryId: cell.ministryId },
  });

  return { ...membership, id: membership._id as string };
}

export async function removeMemberFromCell(
  actorUserId: string,
  membershipId: string,
  reason?: string,
) {
  const actor = await requireActor(actorUserId);
  const client = await getAuthenticatedConvexClient();
  const membership = await client.query(api.cells.getMembershipById, {
    membershipId: membershipId as Id<"cellMemberships">,
  });
  if (!membership || membership.status !== "active") {
    throw new DomainError(DomainErrorCode.MEMBERSHIP_NOT_FOUND, "Membresía no encontrada.");
  }

  const cell = await getCellOrThrow(membership.cellId as string);
  assertCanMutate(actor, "cells.manage_members", {
    type: "cell",
    id: cell._id as string,
    ministryId: cell.ministryId as string,
  });

  const after = await client
    .mutation(api.cells.removeMember, {
      membershipId: membershipId as Id<"cellMemberships">,
      reason: reason?.trim() || undefined,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "cell.member.removed",
    entityType: "cell_membership",
    entityId: membershipId,
    metadata: {
      cellId: cell._id,
      personId: membership.personId,
      reason: reason?.trim() || null,
    },
  });

  return { ...after, id: after._id as string };
}

export async function reassignMember(
  actorUserId: string,
  membershipId: string,
  targetCellId: string,
  reason?: string,
) {
  const actor = await requireActor(actorUserId);
  const client = await getAuthenticatedConvexClient();
  const membership = await client.query(api.cells.getMembershipById, {
    membershipId: membershipId as Id<"cellMemberships">,
  });
  if (!membership || membership.status !== "active") {
    throw new DomainError(DomainErrorCode.MEMBERSHIP_NOT_FOUND, "Membresía no encontrada.");
  }

  const source = await getCellOrThrow(membership.cellId as string);
  const target = await getCellOrThrow(targetCellId);

  assertCanMutate(actor, "cells.manage_members", {
    type: "cell",
    id: source._id as string,
    ministryId: source.ministryId as string,
  });
  assertCanMutate(actor, "cells.manage_members", {
    type: "cell",
    id: target._id as string,
    ministryId: target.ministryId as string,
  });

  if ((source.ministryId as string) !== (target.ministryId as string)) {
    throw new DomainError(
      DomainErrorCode.CELL_NOT_AUTHORIZED,
      "La reasignación entre Ministerios no está habilitada en esta fase.",
    );
  }
  if (target.status === "closed") {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "La célula destino está cerrada.");
  }

  const sourceNetwork = await loadNetwork(source.networkId as string);
  const targetNetwork = await loadNetwork(target.networkId as string);
  if (sourceNetwork.code !== targetNetwork.code) {
    // Same pastoral Red required for simple reassignment in Phase 3
    const org = await currentPersonOrg(membership.personId as string);
    if (!org?.networkId) {
      throw new DomainError(
        DomainErrorCode.PERSON_NETWORK_INCOMPATIBLE,
        "Sin Red actual para validar reasignación.",
      );
    }
    const personNetwork = await loadNetwork(org.networkId);
    if (
      !canJoinCellNetwork(
        personNetwork.code as NetworkCode,
        targetNetwork.code as NetworkCode,
      )
    ) {
      throw new DomainError(
        DomainErrorCode.PERSON_NETWORK_INCOMPATIBLE,
        "La persona no es compatible con la Red destino.",
      );
    }
  }

  const result = await client
    .mutation(api.cells.reassignMember, {
      membershipId: membershipId as Id<"cellMemberships">,
      targetCellId: targetCellId as Id<"cells">,
      reason: reason?.trim() || undefined,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "cell.member.reassigned",
    entityType: "cell_membership",
    entityId: result._id,
    metadata: {
      fromCellId: source._id,
      toCellId: target._id,
      personId: membership.personId,
      previousMembershipId: membershipId,
    },
  });

  return { ...result, id: result._id as string };
}

export async function searchPersonsForCell(
  actorUserId: string,
  cellId: string,
  q: string,
) {
  const actor = await requireActor(actorUserId);
  const cell = await getCellOrThrow(cellId);
  assertCanMutate(actor, "cells.manage_members", {
    type: "cell",
    id: cellId,
    ministryId: cell.ministryId as string,
  });

  const query = q.trim();
  if (query.length < 2) return [];

  const client = await getAuthenticatedConvexClient();
  const rows = await client.query(api.persons.searchActiveInMinistry, {
    ministryId: cell.ministryId,
    search: query,
    limit: 20,
  });

  return rows.map((r) => ({
    id: r._id as string,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone ?? null,
    fullName: formatFullName(r.firstName, r.lastName),
  }));
}

export async function saveCellAttendance(
  actorUserId: string,
  cellId: string,
  raw: SaveAttendanceInput,
) {
  const actor = await requireActor(actorUserId);
  const cell = await getCellOrThrow(cellId);
  assertCanMutate(actor, "cells.attendance", {
    type: "cell",
    id: cellId,
    ministryId: cell.ministryId as string,
  });

  const input = saveAttendanceInputSchema.parse(raw);
  const client = await getAuthenticatedConvexClient();

  const existingBoard = await client.query(api.cells.attendanceBoard, {
    cellId: cellId as Id<"cells">,
    sessionDate: input.sessionDate,
  });
  const sessionExisted = existingBoard.sessionId !== null;

  const sessionId = await client
    .mutation(api.cells.saveAttendance, {
      cellId: cellId as Id<"cells">,
      sessionDate: input.sessionDate,
      notes: input.notes?.trim() || undefined,
      recordedByUserId: actorUserId as Id<"users">,
      records: input.records.map((record) => ({
        personId: record.personId as Id<"persons">,
        membershipId: record.membershipId
          ? (record.membershipId as Id<"cellMemberships">)
          : undefined,
        status: record.status,
        notes: record.notes?.trim() || undefined,
      })),
    })
    .catch(mapConvexError);

  if (!sessionExisted) {
    await writeAuditLog({
      actorUserId,
      action: "cell.attendance.session.created",
      entityType: "cell_attendance_session",
      entityId: sessionId,
      metadata: { cellId, sessionDate: input.sessionDate },
    });
  }

  await writeAuditLog({
    actorUserId,
    action: "cell.attendance.recorded",
    entityType: "cell_attendance_session",
    entityId: sessionId,
    metadata: {
      cellId,
      sessionDate: input.sessionDate,
      recordCount: input.records.length,
      presentCount: input.records.filter((r) => r.status === "present").length,
    },
  });

  return { sessionId: sessionId as string };
}

export async function getAttendanceBoard(actorUserId: string, cellId: string, sessionDate: string) {
  const actor = await requireActor(actorUserId);
  const cell = await getCellOrThrow(cellId);
  assertCanMutate(actor, "cells.attendance", {
    type: "cell",
    id: cellId,
    ministryId: cell.ministryId as string,
  });

  const client = await getAuthenticatedConvexClient();
  const board = await client.query(api.cells.attendanceBoard, {
    cellId: cellId as Id<"cells">,
    sessionDate,
  });

  const byPerson = Object.fromEntries(
    board.attendance.map((r) => [r.personId as string, { status: r.status, notes: r.notes ?? null }]),
  );

  return {
    cell: toCellRecord(cell),
    activeMembers: board.activeMembers.map((m) => ({
      membershipId: m.membershipId as string,
      personId: m.personId as string,
      fullName: formatFullName(m.firstName, m.lastName),
    })),
    session: board.sessionId
      ? { id: board.sessionId as string, status: board.sessionStatus }
      : null,
    byPerson,
  };
}

export async function listCatalogsForCells(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  const client = await getAuthenticatedConvexClient();
  const [districtRows, networkRows, allMinistryRows] = await Promise.all([
    client.query(api.foundation.listActiveDistricts, {}),
    client.query(api.organization.listNetworks, {}),
    client.query(api.organization.listMinistries, {}),
  ]);

  const districts = [...districtRows]
    .filter((d) => d.isActive)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ id: d._id as string, name: d.name }));

  const networks = [...networkRows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((n) => n.isActive && n.code !== "ninos")
    .map((n) => ({ id: n._id as string, code: n.code as string, name: n.name, isActive: n.isActive }));

  let ministries = [...allMinistryRows]
    .filter((m) => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((m) => ({ id: m._id as string, code: m.code, name: m.name }));

  if (!isSuperadmin(actor)) {
    ministries = ministries.filter((m) => actor.ministryIds.includes(m.id));
  }

  return {
    districts,
    networks,
    ministries,
  };
}
