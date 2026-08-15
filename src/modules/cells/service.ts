import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  cellAttendance,
  cellAttendanceSessions,
  cellMemberships,
  cells,
  districts,
  ministries,
  networks,
  personOrganizationHistory,
  persons,
} from "@/db/schema";
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

import { formatCellSchedule } from "./schedule";
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
  const [row] = await db.select().from(ministries).where(eq(ministries.id, ministryId)).limit(1);
  if (!row || !row.isActive) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no disponible.");
  }
  return row;
}

async function currentPersonOrg(personId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      ministryId: personOrganizationHistory.ministryId,
      networkId: personOrganizationHistory.networkId,
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

async function getCellOrThrow(cellId: string) {
  const db = getDb();
  const [row] = await db.select().from(cells).where(eq(cells.id, cellId)).limit(1);
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
  const db = getDb();
  const conditions = [
    eq(cells.responsiblePersonId, responsiblePersonId),
    sql`${cells.status} <> 'closed'`,
  ];
  if (excludeCellId) {
    conditions.push(sql`${cells.id} <> ${excludeCellId}::uuid`);
  }
  const rows = await db
    .select({ id: cells.id, type: cells.type })
    .from(cells)
    .where(and(...conditions));
  return rows;
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

  const db = getDb();
  const [cell] = await db
    .insert(cells)
    .values({
      name: input.name.trim(),
      code: input.code?.trim() ? input.code.trim() : null,
      type: input.type,
      ministryId: input.ministryId,
      networkId: input.networkId,
      responsiblePersonId: input.responsiblePersonId ?? null,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      timezone: input.timezone || "America/Lima",
      address: input.address?.trim() || null,
      districtId: input.districtId && input.districtId !== "" ? input.districtId : null,
      status: "active",
    })
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "cell.created",
    entityType: "cell",
    entityId: cell.id,
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

  return cell;
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
    ministryId: cell.ministryId,
  });

  if (cell.status === "closed") {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "La célula está cerrada.");
  }

  const input = updateCellInputSchema.parse(raw);
  const db = getDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.code !== undefined) updates.code = input.code.trim() ? input.code.trim() : null;
  if (input.networkId !== undefined) {
    const network = await assertNetworkActiveForCapture(input.networkId);
    updates.networkId = network.id;
  }
  if (input.dayOfWeek !== undefined) updates.dayOfWeek = input.dayOfWeek;
  if (input.startTime !== undefined) updates.startTime = input.startTime;
  if (input.timezone !== undefined) updates.timezone = input.timezone;
  if (input.address !== undefined) updates.address = input.address.trim() || null;
  if (input.districtId !== undefined) {
    updates.districtId =
      input.districtId && input.districtId !== "" ? input.districtId : null;
  }
  if (input.status !== undefined && input.status !== "closed") {
    updates.status = input.status;
  }
  if (input.responsiblePersonId !== undefined) {
    const responsibleId = input.responsiblePersonId || null;
    if (responsibleId) {
      await assertResponsibleCapacity(responsibleId, cell.type, cellId);
      const networkId = (updates.networkId as string | undefined) ?? cell.networkId;
      const network = await loadNetwork(networkId);
      await assertResponsibleNetworkCompat(responsibleId, network.code as NetworkCode);
      const org = await currentPersonOrg(responsibleId);
      if (!org?.ministryId || org.ministryId !== cell.ministryId) {
        throw new DomainError(
          DomainErrorCode.CELL_NOT_AUTHORIZED,
          "El responsable debe pertenecer al mismo Ministerio.",
        );
      }
    }
    updates.responsiblePersonId = responsibleId;
  }

  const [after] = await db
    .update(cells)
    .set(updates)
    .where(eq(cells.id, cellId))
    .returning();

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

  return after;
}

export async function closeCell(actorUserId: string, cellId: string) {
  const actor = await requireActor(actorUserId);
  const cell = await getCellOrThrow(cellId);
  assertCanMutate(actor, "cells.update", {
    type: "cell",
    id: cellId,
    ministryId: cell.ministryId,
  });

  const db = getDb();
  const [{ activeMembers }] = await db
    .select({ activeMembers: count() })
    .from(cellMemberships)
    .where(
      and(eq(cellMemberships.cellId, cellId), eq(cellMemberships.status, "active")),
    );

  if (Number(activeMembers) > 0) {
    throw new DomainError(
      DomainErrorCode.CELL_HAS_ACTIVE_MEMBERS,
      "No se puede cerrar la célula mientras tenga miembros activos. Reasigna o retira primero.",
      { activeMembers: Number(activeMembers) },
    );
  }

  const [after] = await db
    .update(cells)
    .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(eq(cells.id, cellId))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "cell.closed",
    entityType: "cell",
    entityId: cellId,
    metadata: { ministryId: cell.ministryId },
  });

  return after;
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

export async function listCellsForActor(actorUserId: string, filters: CellListFilters = {}) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "cells.read", { type: "cell" });

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const db = getDb();
  const conditions = [];

  if (!isSuperadmin(actor)) {
    if (actor.ministryIds.length === 0) {
      return {
        rows: [],
        total: 0,
        page,
        pageSize,
        stats: emptyCellStats(),
      };
    }
    conditions.push(
      sql`${cells.ministryId} in (${sql.join(
        actor.ministryIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }

  if (filters.ministryId) {
    if (!canAccessMinistry(actor, filters.ministryId) && !isSuperadmin(actor)) {
      throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "Ministerio fuera de alcance.");
    }
    conditions.push(eq(cells.ministryId, filters.ministryId));
  }
  if (filters.networkId) conditions.push(eq(cells.networkId, filters.networkId));
  if (filters.status) conditions.push(eq(cells.status, filters.status));
  if (filters.type) conditions.push(eq(cells.type, filters.type));
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    conditions.push(or(ilike(cells.name, q), ilike(cells.code, q))!);
  }

  const whereExpr = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(cells).where(whereExpr);

  const rows = await db
    .select({
      id: cells.id,
      code: cells.code,
      name: cells.name,
      type: cells.type,
      status: cells.status,
      dayOfWeek: cells.dayOfWeek,
      startTime: cells.startTime,
      ministryId: cells.ministryId,
      ministryName: ministries.name,
      ministryCode: ministries.code,
      networkId: cells.networkId,
      networkName: networks.name,
      responsiblePersonId: cells.responsiblePersonId,
      responsibleFirstName: persons.firstName,
      responsibleLastName: persons.lastName,
      activeMembers: sql<number>`(
        select count(*)::int from cell_memberships cm
        where cm.cell_id = cells.id and cm.status = 'active'
      )`,
    })
    .from(cells)
    .innerJoin(ministries, eq(cells.ministryId, ministries.id))
    .innerJoin(networks, eq(cells.networkId, networks.id))
    .leftJoin(persons, eq(cells.responsiblePersonId, persons.id))
    .where(whereExpr)
    .orderBy(asc(cells.name))
    .limit(pageSize)
    .offset(offset);

  return {
    rows: rows.map((row) => ({
      ...row,
      scheduleLabel: formatCellSchedule(row.dayOfWeek, row.startTime),
      responsibleName: row.responsibleFirstName
        ? formatFullName(row.responsibleFirstName, row.responsibleLastName ?? ".")
        : null,
    })),
    total: Number(total),
    page,
    pageSize,
    stats: await computeCellStats(actor),
  };
}

function emptyCellStats() {
  return {
    total: 0,
    active: 0,
    evangelistic: 0,
    twelve: 0,
    recentAttendanceAvg: null as number | null,
  };
}

async function computeCellStats(actor: AuthContext) {
  const db = getDb();
  const scope =
    isSuperadmin(actor)
      ? sql`true`
      : actor.ministryIds.length === 0
        ? sql`false`
        : sql`${cells.ministryId} in (${sql.join(
            actor.ministryIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`;

  const [{ total }] = await db.select({ total: count() }).from(cells).where(scope);
  const [{ active }] = await db
    .select({ active: count() })
    .from(cells)
    .where(and(scope, eq(cells.status, "active")));
  const [{ evangelistic }] = await db
    .select({ evangelistic: count() })
    .from(cells)
    .where(and(scope, eq(cells.type, "evangelistic")));
  const [{ twelve }] = await db
    .select({ twelve: count() })
    .from(cells)
    .where(and(scope, eq(cells.type, "twelve")));

  const avgSource = await db
    .select({
      sessionId: cellAttendanceSessions.id,
      present: sql<number>`count(*) filter (where ${cellAttendance.status} = 'present')`,
      total: sql<number>`count(${cellAttendance.id})`,
    })
    .from(cellAttendanceSessions)
    .innerJoin(cells, eq(cellAttendanceSessions.cellId, cells.id))
    .leftJoin(cellAttendance, eq(cellAttendance.sessionId, cellAttendanceSessions.id))
    .where(scope)
    .groupBy(cellAttendanceSessions.id, cellAttendanceSessions.sessionDate)
    .orderBy(desc(cellAttendanceSessions.sessionDate))
    .limit(20);

  const pcts = avgSource
    .map((row) => {
      const total = Number(row.total);
      if (!total) return null;
      return (Number(row.present) / total) * 100;
    })
    .filter((v): v is number => v !== null);

  const recentAttendanceAvg = pcts.length
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
    : null;

  return {
    total: Number(total),
    active: Number(active),
    evangelistic: Number(evangelistic),
    twelve: Number(twelve),
    recentAttendanceAvg,
  };
}

export async function getCellDetail(actorUserId: string, cellId: string) {
  const actor = await requireActor(actorUserId);
  const cell = await getCellOrThrow(cellId);
  assertCellReadable(actor, cell.ministryId);

  const db = getDb();
  const [ministry] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.id, cell.ministryId))
    .limit(1);
  const [network] = await db
    .select()
    .from(networks)
    .where(eq(networks.id, cell.networkId))
    .limit(1);
  const [district] = cell.districtId
    ? await db.select().from(districts).where(eq(districts.id, cell.districtId)).limit(1)
    : [null];
  const [responsible] = cell.responsiblePersonId
    ? await db
        .select()
        .from(persons)
        .where(eq(persons.id, cell.responsiblePersonId))
        .limit(1)
    : [null];

  const members = await db
    .select({
      membershipId: cellMemberships.id,
      personId: cellMemberships.personId,
      status: cellMemberships.status,
      joinedAt: cellMemberships.joinedAt,
      leftAt: cellMemberships.leftAt,
      leaveReason: cellMemberships.leaveReason,
      firstName: persons.firstName,
      lastName: persons.lastName,
      phone: persons.phone,
    })
    .from(cellMemberships)
    .innerJoin(persons, eq(cellMemberships.personId, persons.id))
    .where(eq(cellMemberships.cellId, cellId))
    .orderBy(desc(cellMemberships.joinedAt));

  const activeMembers = members.filter((m) => m.status === "active");

  const sessions = await db
    .select()
    .from(cellAttendanceSessions)
    .where(eq(cellAttendanceSessions.cellId, cellId))
    .orderBy(desc(cellAttendanceSessions.sessionDate))
    .limit(8);

  let lastSessionStats: {
    sessionId: string;
    sessionDate: string;
    present: number;
    total: number;
    pct: number | null;
  } | null = null;

  if (sessions[0]) {
    const stats = await sessionAttendanceCounts(sessions[0].id);
    lastSessionStats = {
      sessionId: sessions[0].id,
      sessionDate: String(sessions[0].sessionDate),
      ...stats,
    };
  }

  const last4 = sessions.slice(0, 4);
  let avgLast4: number | null = null;
  if (last4.length > 0) {
    const pcts: number[] = [];
    for (const s of last4) {
      const st = await sessionAttendanceCounts(s.id);
      if (st.pct !== null) pcts.push(st.pct);
    }
    if (pcts.length) {
      avgLast4 = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    }
  }

  return {
    cell: {
      ...cell,
      scheduleLabel: formatCellSchedule(cell.dayOfWeek, cell.startTime),
    },
    ministry,
    network,
    district,
    responsible: responsible
      ? {
          ...responsible,
          fullName: formatFullName(responsible.firstName, responsible.lastName),
        }
      : null,
    members: members.map((m) => ({
      ...m,
      fullName: formatFullName(m.firstName, m.lastName),
    })),
    activeMemberCount: activeMembers.length,
    lastSessionStats,
    avgLast4,
    recentSessions: sessions,
  };
}

async function sessionAttendanceCounts(sessionId: string) {
  const db = getDb();
  const rows = await db
    .select({ status: cellAttendance.status, c: count() })
    .from(cellAttendance)
    .where(eq(cellAttendance.sessionId, sessionId))
    .groupBy(cellAttendance.status);
  let present = 0;
  let total = 0;
  for (const row of rows) {
    total += Number(row.c);
    if (row.status === "present") present += Number(row.c);
  }
  return {
    present,
    total,
    pct: total === 0 ? null : Math.round((present / total) * 100),
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
    ministryId: cell.ministryId,
  });

  if (cell.status === "closed") {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "La célula está cerrada.");
  }

  const db = getDb();
  const [person] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, personId), isNull(persons.deletedAt)))
    .limit(1);
  if (!person) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Persona no encontrada.");
  }

  const org = await currentPersonOrg(personId);
  if (!org?.ministryId || org.ministryId !== cell.ministryId) {
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
  const cellNetwork = await loadNetwork(cell.networkId);
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

  const membershipRole = cell.type === "twelve" ? "twelve_team" : "member";

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

  // Dual membership allowed: one ordinary (member) + one twelve_team.
  const conflicting = await db
    .select({
      id: cellMemberships.id,
      cellId: cellMemberships.cellId,
      role: cellMemberships.role,
    })
    .from(cellMemberships)
    .where(
      and(
        eq(cellMemberships.personId, personId),
        eq(cellMemberships.status, "active"),
        eq(cellMemberships.role, membershipRole),
      ),
    )
    .limit(1);
  if (conflicting[0]) {
    throw new DomainError(
      DomainErrorCode.MEMBERSHIP_ALREADY_ACTIVE,
      "La persona ya tiene una membresía activa de este tipo.",
      { membershipId: conflicting[0].id, cellId: conflicting[0].cellId },
    );
  }

  const [membership] = await db
    .insert(cellMemberships)
    .values({
      cellId,
      personId,
      status: "active",
      role: membershipRole,
    })
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "cell.member.added",
    entityType: "cell_membership",
    entityId: membership.id,
    metadata: { cellId, personId, ministryId: cell.ministryId },
  });

  return membership;
}

export async function removeMemberFromCell(
  actorUserId: string,
  membershipId: string,
  reason?: string,
) {
  const actor = await requireActor(actorUserId);
  const db = getDb();
  const [membership] = await db
    .select()
    .from(cellMemberships)
    .where(eq(cellMemberships.id, membershipId))
    .limit(1);
  if (!membership || membership.status !== "active") {
    throw new DomainError(DomainErrorCode.MEMBERSHIP_NOT_FOUND, "Membresía no encontrada.");
  }

  const cell = await getCellOrThrow(membership.cellId);
  assertCanMutate(actor, "cells.manage_members", {
    type: "cell",
    id: cell.id,
    ministryId: cell.ministryId,
  });

  const [after] = await db
    .update(cellMemberships)
    .set({
      status: "left",
      leftAt: new Date(),
      leaveReason: reason?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(cellMemberships.id, membershipId))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "cell.member.removed",
    entityType: "cell_membership",
    entityId: membershipId,
    metadata: {
      cellId: cell.id,
      personId: membership.personId,
      reason: reason?.trim() || null,
    },
  });

  return after;
}

export async function reassignMember(
  actorUserId: string,
  membershipId: string,
  targetCellId: string,
  reason?: string,
) {
  const actor = await requireActor(actorUserId);
  const db = getDb();
  const [membership] = await db
    .select()
    .from(cellMemberships)
    .where(eq(cellMemberships.id, membershipId))
    .limit(1);
  if (!membership || membership.status !== "active") {
    throw new DomainError(DomainErrorCode.MEMBERSHIP_NOT_FOUND, "Membresía no encontrada.");
  }

  const source = await getCellOrThrow(membership.cellId);
  const target = await getCellOrThrow(targetCellId);

  assertCanMutate(actor, "cells.manage_members", {
    type: "cell",
    id: source.id,
    ministryId: source.ministryId,
  });
  assertCanMutate(actor, "cells.manage_members", {
    type: "cell",
    id: target.id,
    ministryId: target.ministryId,
  });

  if (source.ministryId !== target.ministryId) {
    throw new DomainError(
      DomainErrorCode.CELL_NOT_AUTHORIZED,
      "La reasignación entre Ministerios no está habilitada en esta fase.",
    );
  }
  if (target.status === "closed") {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "La célula destino está cerrada.");
  }

  const sourceNetwork = await loadNetwork(source.networkId);
  const targetNetwork = await loadNetwork(target.networkId);
  if (sourceNetwork.code !== targetNetwork.code) {
    // Same pastoral Red required for simple reassignment in Phase 3
    const org = await currentPersonOrg(membership.personId);
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

  const result = await db.transaction(async (tx) => {
    await tx
      .update(cellMemberships)
      .set({
        status: "transferred",
        leftAt: new Date(),
        leaveReason: reason?.trim() || "Reasignación de célula",
        updatedAt: new Date(),
      })
      .where(eq(cellMemberships.id, membershipId));

    const [created] = await tx
      .insert(cellMemberships)
      .values({
        cellId: targetCellId,
        personId: membership.personId,
        status: "active",
      })
      .returning();
    return created;
  });

  await writeAuditLog({
    actorUserId,
    action: "cell.member.reassigned",
    entityType: "cell_membership",
    entityId: result.id,
    metadata: {
      fromCellId: source.id,
      toCellId: target.id,
      personId: membership.personId,
      previousMembershipId: membershipId,
    },
  });

  return result;
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
    ministryId: cell.ministryId,
  });

  const query = q.trim();
  if (query.length < 2) return [];

  const db = getDb();
  const like = `%${query}%`;
  const rows = await db
    .select({
      id: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      phone: persons.phone,
    })
    .from(persons)
    .innerJoin(
      personOrganizationHistory,
      and(
        eq(personOrganizationHistory.personId, persons.id),
        isNull(personOrganizationHistory.effectiveTo),
        eq(personOrganizationHistory.ministryId, cell.ministryId),
      ),
    )
    .where(
      and(
        isNull(persons.deletedAt),
        or(
          ilike(persons.firstName, like),
          ilike(persons.lastName, like),
          ilike(persons.phone, like),
          sql`concat(${persons.firstName}, ' ', ${persons.lastName}) ilike ${like}`,
        ),
      ),
    )
    .orderBy(asc(persons.lastName), asc(persons.firstName))
    .limit(20);

  return rows.map((r) => ({
    ...r,
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
    ministryId: cell.ministryId,
  });

  const input = saveAttendanceInputSchema.parse(raw);
  const db = getDb();

  let session = (
    await db
      .select()
      .from(cellAttendanceSessions)
      .where(
        and(
          eq(cellAttendanceSessions.cellId, cellId),
          eq(cellAttendanceSessions.sessionDate, input.sessionDate),
        ),
      )
      .limit(1)
  )[0];

  let sessionCreated = false;
  if (!session) {
    try {
      const [created] = await db
        .insert(cellAttendanceSessions)
        .values({
          cellId,
          sessionDate: input.sessionDate,
          status: "open",
          notes: input.notes?.trim() || null,
          createdByUserId: actorUserId,
        })
        .returning();
      session = created;
      sessionCreated = true;
    } catch {
      throw new DomainError(
        DomainErrorCode.ATTENDANCE_SESSION_ALREADY_EXISTS,
        "Ya existe una sesión de asistencia para esa fecha.",
      );
    }
  }

  if (sessionCreated) {
    await writeAuditLog({
      actorUserId,
      action: "cell.attendance.session.created",
      entityType: "cell_attendance_session",
      entityId: session.id,
      metadata: { cellId, sessionDate: input.sessionDate },
    });
  }

  await db.transaction(async (tx) => {
    for (const record of input.records) {
      const existing = await tx
        .select({ id: cellAttendance.id })
        .from(cellAttendance)
        .where(
          and(
            eq(cellAttendance.sessionId, session.id),
            eq(cellAttendance.personId, record.personId),
          ),
        )
        .limit(1);

      if (existing[0]) {
        await tx
          .update(cellAttendance)
          .set({
            status: record.status,
            notes: record.notes?.trim() || null,
            membershipId: record.membershipId ?? null,
            recordedByUserId: actorUserId,
            recordedAt: new Date(),
          })
          .where(eq(cellAttendance.id, existing[0].id));
      } else {
        await tx.insert(cellAttendance).values({
          sessionId: session.id,
          personId: record.personId,
          membershipId: record.membershipId ?? null,
          status: record.status,
          notes: record.notes?.trim() || null,
          recordedByUserId: actorUserId,
        });
      }
    }

    await tx
      .update(cellAttendanceSessions)
      .set({ status: "completed", notes: input.notes?.trim() || session.notes })
      .where(eq(cellAttendanceSessions.id, session.id));
  });

  await writeAuditLog({
    actorUserId,
    action: "cell.attendance.recorded",
    entityType: "cell_attendance_session",
    entityId: session.id,
    metadata: {
      cellId,
      sessionDate: input.sessionDate,
      recordCount: input.records.length,
      presentCount: input.records.filter((r) => r.status === "present").length,
    },
  });

  return { sessionId: session.id };
}

export async function getAttendanceBoard(actorUserId: string, cellId: string, sessionDate: string) {
  const detail = await getCellDetail(actorUserId, cellId);
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "cells.attendance", {
    type: "cell",
    id: cellId,
    ministryId: detail.cell.ministryId,
  });

  const db = getDb();
  const [session] = await db
    .select()
    .from(cellAttendanceSessions)
    .where(
      and(
        eq(cellAttendanceSessions.cellId, cellId),
        eq(cellAttendanceSessions.sessionDate, sessionDate),
      ),
    )
    .limit(1);

  const records = session
    ? await db
        .select()
        .from(cellAttendance)
        .where(eq(cellAttendance.sessionId, session.id))
    : [];

  const byPerson = Object.fromEntries(records.map((r) => [r.personId, r]));

  return {
    cell: detail.cell,
    activeMembers: detail.members.filter((m) => m.status === "active"),
    session,
    byPerson,
  };
}

export async function listCatalogsForCells(actorUserId: string) {
  const actor = await requireActor(actorUserId);
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
  let ministryRows = await db
    .select({
      id: ministries.id,
      code: ministries.code,
      name: ministries.name,
    })
    .from(ministries)
    .where(eq(ministries.isActive, true))
    .orderBy(asc(ministries.sortOrder), asc(ministries.code));

  if (!isSuperadmin(actor)) {
    ministryRows = ministryRows.filter((m) => actor.ministryIds.includes(m.id));
  }

  return {
    districts: districtRows,
    networks: networkRows.filter((n) => n.isActive && n.code !== "ninos"),
    ministries: ministryRows,
  };
}
