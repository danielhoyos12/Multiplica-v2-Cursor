import { clerkClient } from "@clerk/nextjs/server";

import type { Id } from "../../../convex/_generated/dataModel";
import { mapConvexError } from "@/lib/convex-errors";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { buildChildHumanCode } from "@/lib/human-codes";
import { writeAuditLog } from "@/modules/audit";
import {
  assertCanMutate,
  canAccessMinistry,
  isLeaderGeneral,
  isSuperadmin,
  loadAuthContext,
  type AuthContext,
} from "@/modules/authorization";
import { formatFullName } from "@/modules/ganar/normalize";
import { api, getConvexHttpClient } from "@/server/convex";

import { generateTemporaryPassword } from "./credentials";
import { buildUsernameBase, nextUsernameCandidate } from "./username";
import {
  activateLeaderInputSchema,
  convertTwelveInputSchema,
  markEligibleInputSchema,
  type ConvertTwelveInput,
} from "./validation";

const MAX_DIRECT_LEADERS = 12;

async function requireActor(userId: string) {
  return loadAuthContext(userId);
}

async function getLeadership(personId: string) {
  const client = getConvexHttpClient();
  return client.query(api.leadership.getByPerson, { personId: personId as Id<"persons"> });
}

export async function isDescendantOf(
  ancestorPersonId: string,
  descendantPersonId: string,
): Promise<boolean> {
  if (ancestorPersonId === descendantPersonId) return true;
  const client = getConvexHttpClient();
  return client.query(api.leadership.isDescendant, {
    ancestorPersonId: ancestorPersonId as Id<"persons">,
    descendantPersonId: descendantPersonId as Id<"persons">,
  });
}

export async function assertTreeAccess(
  actor: AuthContext,
  targetPersonId: string,
  ministryId?: string | null,
) {
  if (isSuperadmin(actor)) return;
  if (ministryId && canAccessMinistry(actor, ministryId) && isLeaderGeneral(actor)) {
    return;
  }
  if (actor.personId && (await isDescendantOf(actor.personId, targetPersonId))) {
    return;
  }
  throw new DomainError(DomainErrorCode.TREE_ACCESS_DENIED, "Fuera del subárbol autorizado.");
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
  };
}

async function countDirectActiveLeaders(leaderPersonId: string) {
  const client = getConvexHttpClient();
  return client.query(api.leadership.countActiveDirectLeadersFor, {
    leaderPersonId: leaderPersonId as Id<"persons">,
  });
}

async function wouldCreateCycle(personId: string, proposedDirectLeaderId: string) {
  // If proposed leader is already a descendant of person, cycle.
  return isDescendantOf(personId, proposedDirectLeaderId);
}

async function allocateUsername(firstName: string, lastName: string) {
  const client = getConvexHttpClient();
  const base = buildUsernameBase(firstName, lastName);
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = nextUsernameCandidate(base, attempt);
    const existing = await client.query(api.users.getByUsername, { username: candidate });
    if (!existing) return candidate;
  }
  throw new DomainError(DomainErrorCode.USERNAME_COLLISION, "No se pudo generar username único.");
}

async function allocateHumanCode(directLeaderPersonId: string | null, ministryId: string) {
  const client = getConvexHttpClient();
  if (!directLeaderPersonId) {
    const ministry = await client.query(api.organization.getMinistry, {
      ministryId: ministryId as Id<"ministries">,
    });
    const base = ministry?.code ?? `M${ministryId.slice(0, 4)}`;
    const taken = await client.query(api.leadership.isHumanCodeTaken, { code: base });
    if (!taken) return base;
    for (let n = 2; n <= 99; n += 1) {
      const candidate = `${base}-R${n}`;
      const exists = await client.query(api.leadership.isHumanCodeTaken, { code: candidate });
      if (!exists) return candidate;
    }
    throw new DomainError(
      DomainErrorCode.USERNAME_COLLISION,
      "No se pudo asignar código humano de raíz.",
    );
  }

  const parent = await client.query(api.leadership.getByPerson, {
    personId: directLeaderPersonId as Id<"persons">,
  });
  const parentCode = parent?.humanLeaderCode;
  if (!parentCode) {
    throw new DomainError(
      DomainErrorCode.DIRECT_LEADER_INVALID,
      "El líder directo no tiene código humano.",
    );
  }

  const siblings = await client.query(api.leadership.listChildrenAny, {
    directLeaderPersonId: directLeaderPersonId as Id<"persons">,
  });

  let max = 0;
  for (const s of siblings) {
    const code = s.humanLeaderCode;
    if (!code) continue;
    const segment = code.split("-").pop();
    const n = Number(segment);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return buildChildHumanCode(parentCode, max + 1);
}

async function assertCanActivate(
  actor: AuthContext,
  personId: string,
  ministryId: string,
  directLeaderPersonId: string | null,
  isMinistryRoot: boolean,
) {
  assertCanMutate(actor, "leaders.activate", {
    type: "leader",
    ministryId,
    personId,
  });

  if (isSuperadmin(actor)) return;

  if (isMinistryRoot) {
    if (!isLeaderGeneral(actor) || !canAccessMinistry(actor, ministryId)) {
      throw new DomainError(
        DomainErrorCode.LEADER_INVALID_ACTIVATOR,
        "Solo Superadmin o Líder General del Ministerio pueden activar raíces.",
      );
    }
    return;
  }

  if (!directLeaderPersonId) {
    throw new DomainError(
      DomainErrorCode.DIRECT_LEADER_REQUIRED,
      "Se requiere líder directo salvo raíces ministeriales.",
    );
  }

  // Direct leader activator
  if (actor.personId && actor.personId === directLeaderPersonId) {
    return;
  }

  // Leader general of same ministry
  if (isLeaderGeneral(actor) && canAccessMinistry(actor, ministryId)) {
    return;
  }

  throw new DomainError(
    DomainErrorCode.LEADER_INVALID_ACTIVATOR,
    "Solo el líder directo o el Líder General del Ministerio pueden activar.",
  );
}

export async function markPersonEligible(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = markEligibleInputSchema.parse(raw);
  assertCanMutate(actor, "leaders.mark_eligible", {
    type: "leader",
    ministryId: input.ministryId,
    personId: input.personId,
  });

  const org = await currentOrg(input.personId);
  if (!org?.ministryId || org.ministryId !== input.ministryId) {
    throw new DomainError(
      DomainErrorCode.LEADER_DIFFERENT_MINISTRY,
      "La persona no pertenece al Ministerio indicado.",
    );
  }

  const existing = await getLeadership(input.personId);
  if (existing?.status === "active") {
    throw new DomainError(
      DomainErrorCode.LEADER_ALREADY_ACTIVE,
      "La persona ya es líder activo.",
    );
  }

  const intendedDirectLeader =
    input.directLeaderPersonId === undefined ? actor.personId : input.directLeaderPersonId;

  const client = getConvexHttpClient();
  const row = await client
    .mutation(api.leadership.markEligible, {
      personId: input.personId as Id<"persons">,
      ministryId: input.ministryId as Id<"ministries">,
      networkId: input.networkId as Id<"networks">,
      directLeaderPersonId: intendedDirectLeader
        ? (intendedDirectLeader as Id<"persons">)
        : undefined,
      actorUserId: actorUserId as Id<"users">,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "leader.marked_eligible",
    entityType: "person_leadership",
    entityId: row._id,
    metadata: {
      personId: input.personId,
      ministryId: input.ministryId,
      directLeaderPersonId: intendedDirectLeader,
    },
  });
  return { ...row, id: row._id as string };
}

export async function activateLeader(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = activateLeaderInputSchema.parse(raw);
  const client = getConvexHttpClient();

  const person = await client.query(api.persons.getById, {
    personId: input.personId as Id<"persons">,
  });
  if (!person) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Persona no encontrada.");
  }

  const org = await currentOrg(input.personId);
  if (!org?.ministryId || !org.networkId) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      "La persona necesita pertenencia organizacional en GANAR.",
    );
  }

  const leadership = await getLeadership(input.personId);
  if (leadership?.status === "active") {
    throw new DomainError(DomainErrorCode.LEADER_ALREADY_ACTIVE, "Ya es líder activo.");
  }
  if (!leadership || leadership.status !== "eligible") {
    throw new DomainError(
      DomainErrorCode.LEADER_NOT_ELIGIBLE,
      "La persona debe estar marcada como apta/ungida antes de activarse.",
    );
  }

  const isRoot = Boolean(input.isMinistryRoot);
  const directLeaderPersonId = isRoot
    ? null
    : ((input.directLeaderPersonId ?? (leadership.directLeaderPersonId as string | undefined)) ??
      null);

  await assertCanActivate(actor, input.personId, org.ministryId, directLeaderPersonId, isRoot);

  if (!isRoot) {
    if (!directLeaderPersonId) {
      throw new DomainError(DomainErrorCode.DIRECT_LEADER_REQUIRED, "Líder directo requerido.");
    }
    const parent = await getLeadership(directLeaderPersonId);
    if (!parent || parent.status !== "active") {
      throw new DomainError(
        DomainErrorCode.DIRECT_LEADER_INVALID,
        "El líder directo debe estar activo.",
      );
    }
    if ((parent.ministryId as string) !== org.ministryId) {
      throw new DomainError(
        DomainErrorCode.LEADER_DIFFERENT_MINISTRY,
        "El líder directo debe ser del mismo Ministerio.",
      );
    }
    if (await wouldCreateCycle(input.personId, directLeaderPersonId)) {
      throw new DomainError(DomainErrorCode.DIRECT_LEADER_CYCLE, "La relación crearía un ciclo.");
    }
    const directCount = await countDirectActiveLeaders(directLeaderPersonId);
    if (directCount >= MAX_DIRECT_LEADERS) {
      throw new DomainError(
        DomainErrorCode.DIRECT_LEADER_CAPACITY_REACHED,
        "El líder directo ya tiene 12 líderes activos.",
      );
    }
  }

  const humanLeaderCode = await allocateHumanCode(directLeaderPersonId, org.ministryId);
  const username = await allocateUsername(person.firstName, person.lastName);
  const email =
    (input.email && input.email.trim()) || person.email || `${username}@multiplica.local`;
  const temporaryPassword = generateTemporaryPassword();

  // Credential provisioning outside DB transaction (Clerk), then DB work.
  let appUserId: string | null = null;
  let clerkUserId: string | null = null;
  let provisionedNew = false;
  const existingUser = await client.query(api.users.getByPersonId, {
    personId: input.personId as Id<"persons">,
  });

  try {
    const clerk = await clerkClient();
    if (existingUser) {
      appUserId = existingUser._id as string;
      clerkUserId = existingUser.authSubject;
      await client
        .mutation(api.users.provisionLeaderUser, {
          personId: input.personId as Id<"persons">,
          authSubject: existingUser.authSubject,
          email,
          username,
          displayName: formatFullName(person.firstName, person.lastName),
        })
        .catch(mapConvexError);
    } else {
      const created = await clerk.users.createUser({
        emailAddress: [email],
        password: temporaryPassword,
        skipPasswordChecks: true,
        skipPasswordRequirement: false,
        publicMetadata: {
          mustChangePassword: true,
          username,
          personId: input.personId,
        },
      });
      clerkUserId = created.id;
      provisionedNew = true;
      const inserted = await client
        .mutation(api.users.provisionLeaderUser, {
          personId: input.personId as Id<"persons">,
          authSubject: clerkUserId,
          email,
          username,
          displayName: formatFullName(person.firstName, person.lastName),
        })
        .catch(mapConvexError);
      appUserId = inserted._id as string;
    }

    const roleContext = await client.query(api.authz.loadContext, {
      userId: appUserId as Id<"users">,
    });
    if (!roleContext.roleCodes.includes("leader")) {
      await client
        .mutation(api.authz.assignRole, {
          userId: appUserId as Id<"users">,
          roleCode: "leader",
          ministryId: org.ministryId as Id<"ministries">,
          networkId: org.networkId as Id<"networks">,
          createdByUserId: actorUserId as Id<"users">,
        })
        .catch(mapConvexError);
    }

    const cell = await client
      .mutation(api.cells.create, {
        name: input.cell.name.trim(),
        type: "evangelistic",
        ministryId: org.ministryId as Id<"ministries">,
        networkId: org.networkId as Id<"networks">,
        responsiblePersonId: input.personId as Id<"persons">,
        responsibleUserId: appUserId as Id<"users">,
        dayOfWeek: input.cell.dayOfWeek,
        startTime: input.cell.startTime,
        timezone: "America/Lima",
        address: input.cell.address?.trim() || undefined,
        districtId:
          input.cell.districtId && input.cell.districtId !== ""
            ? (input.cell.districtId as Id<"districts">)
            : undefined,
      })
      .catch(mapConvexError);

    const updatedLeadership = await client
      .mutation(api.leadership.activate, {
        personId: input.personId as Id<"persons">,
        directLeaderPersonId: directLeaderPersonId
          ? (directLeaderPersonId as Id<"persons">)
          : undefined,
        primaryCellId: cell._id,
        isMinistryRoot: isRoot,
        humanLeaderCode,
        actorUserId: actorUserId as Id<"users">,
      })
      .catch(mapConvexError);

    // If direct leader already has a Célula de 12 with capacity, add twelve_team membership
    if (directLeaderPersonId) {
      const responsibleCells = await client.query(api.cells.listByResponsible, {
        responsiblePersonId: directLeaderPersonId as Id<"persons">,
      });
      const twelveCell = responsibleCells.find(
        (c) => c.type === "twelve" && c.status === "active",
      );
      if (twelveCell) {
        const [{ count: activeCount }] = await client.query(api.cells.countActiveMembers, {
          cellIds: [twelveCell._id],
        });
        if ((activeCount ?? 0) < MAX_DIRECT_LEADERS) {
          await client
            .mutation(api.cells.addMember, {
              cellId: twelveCell._id,
              personId: input.personId as Id<"persons">,
              role: "twelve_team",
            })
            .catch(mapConvexError);
        }
      }
    }

    await writeAuditLog({
      actorUserId,
      action: "leader.activated",
      entityType: "person_leadership",
      entityId: updatedLeadership._id,
      metadata: {
        personId: input.personId,
        cellId: cell._id,
        directLeaderPersonId,
        humanLeaderCode,
        username,
        provisionedNew,
      },
    });
    await writeAuditLog({
      actorUserId,
      action: "leader.credentials_provisioned",
      entityType: "user",
      entityId: appUserId,
      metadata: {
        personId: input.personId,
        username,
        clerkUserId,
        provisionedNew,
        // Never include password
      },
    });
    await writeAuditLog({
      actorUserId,
      action: "leader.role_assigned",
      entityType: "user",
      entityId: appUserId,
      metadata: { role: "leader", ministryId: org.ministryId },
    });

    return {
      leadership: { ...updatedLeadership, id: updatedLeadership._id as string },
      cell: { ...cell, id: cell._id as string },
      username,
      email,
      temporaryPassword: provisionedNew ? temporaryPassword : null,
      mustChangePassword: provisionedNew,
    };
  } catch (error) {
    if (provisionedNew && clerkUserId && appUserId) {
      try {
        const clerk = await clerkClient();
        await clerk.users.deleteUser(clerkUserId);
        await client.mutation(api.users.remove, { userId: appUserId as Id<"users"> });
      } catch {
        // best-effort rollback of Clerk user
      }
    }
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      DomainErrorCode.CREDENTIAL_PROVISION_FAILED,
      error instanceof Error ? error.message : "Fallo en activación.",
    );
  }
}

export async function deactivateLeader(actorUserId: string, personId: string) {
  const actor = await requireActor(actorUserId);
  const leadership = await getLeadership(personId);
  if (!leadership || leadership.status !== "active") {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Líder activo no encontrado.");
  }
  assertCanMutate(actor, "leaders.deactivate", {
    type: "leader",
    ministryId: leadership.ministryId as string,
    personId,
  });

  const client = getConvexHttpClient();
  const directCount = await countDirectActiveLeaders(personId);
  const ownCells = await client.query(api.cells.listByResponsible, {
    responsiblePersonId: personId as Id<"persons">,
  });
  const cellsCount = ownCells.filter((c) => c.status !== "closed").length;

  if (directCount > 0 || cellsCount > 0) {
    throw new DomainError(
      DomainErrorCode.LEADER_HAS_ACTIVE_STRUCTURE,
      "No se puede desactivar: hay células o líderes directos. Use un plan de desactivación en /transferencias (leader_deactivation).",
      {
        directCount,
        cellsCount,
        requiresDeactivationPlan: true,
        transferType: "leader_deactivation",
      },
    );
  }

  const row = await client
    .mutation(api.leadership.deactivate, {
      personId: personId as Id<"persons">,
      actorUserId: actorUserId as Id<"users">,
    })
    .catch(mapConvexError);

  await writeAuditLog({
    actorUserId,
    action: "leader.deactivated",
    entityType: "person_leadership",
    entityId: row._id,
    metadata: { personId },
  });
  return { ...row, id: row._id as string };
}

export async function getTwelveProgress(leaderPersonId: string) {
  const direct = await countDirectActiveLeaders(leaderPersonId);
  return {
    current: direct,
    max: MAX_DIRECT_LEADERS,
    ready: direct >= MAX_DIRECT_LEADERS,
    label: `${direct} / ${MAX_DIRECT_LEADERS} líderes`,
  };
}

export async function listDirectLeaders(actorUserId: string, leaderPersonId: string) {
  const actor = await requireActor(actorUserId);
  const leadership = await getLeadership(leaderPersonId);
  if (!leadership) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Liderazgo no encontrado.");
  }
  await assertTreeAccess(actor, leaderPersonId, leadership.ministryId as string);
  assertCanMutate(actor, "leaders.read", {
    type: "leader",
    ministryId: leadership.ministryId as string,
  });

  const client = getConvexHttpClient();
  const rows = await client.query(api.leadership.listDirectLeaders, {
    leaderPersonId: leaderPersonId as Id<"persons">,
  });

  return rows.map((r) => ({
    personId: r.personId as string,
    humanLeaderCode: r.humanLeaderCode ?? null,
    status: r.status,
    primaryCellId: (r.primaryCellId as string | undefined) ?? null,
    firstName: r.firstName,
    lastName: r.lastName,
    fullName: formatFullName(r.firstName, r.lastName),
  }));
}

export async function getLeaderDashboard(actorUserId: string, focusPersonId?: string) {
  const actor = await requireActor(actorUserId);
  const personId = focusPersonId ?? actor.personId;
  if (!personId) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      "El usuario no está vinculado a una Persona Maestra.",
    );
  }

  const client = getConvexHttpClient();
  const dashboard = await client.query(api.leadership.getDashboard, {
    personId: personId as Id<"persons">,
  });
  if (!dashboard) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Sin registro de liderazgo.");
  }
  const leadership = dashboard.leadership;
  await assertTreeAccess(actor, personId, leadership.ministryId as string);

  const [ownCellsRaw, person, ministry, networks, eligiblePendingRaw, directs] =
    await Promise.all([
      client.query(api.cells.listByResponsible, {
        responsiblePersonId: personId as Id<"persons">,
      }),
      client.query(api.persons.getById, { personId: personId as Id<"persons"> }),
      client.query(api.organization.getMinistry, { ministryId: leadership.ministryId }),
      client.query(api.organization.listNetworks, {}),
      client.query(api.leadership.listEligibleChildren, {
        directLeaderPersonId: personId as Id<"persons">,
      }),
      listDirectLeaders(actorUserId, personId),
    ]);

  const ownCells = ownCellsRaw
    .filter((c) => c.status !== "closed")
    .map((c) => ({ ...c, id: c._id as string }));
  const network = networks.find((n) => n._id === leadership.networkId) ?? null;

  const progress = {
    current: dashboard.directLeaderCount,
    max: dashboard.directLeaderCapacity,
    ready: dashboard.readyForTwelve,
    label: `${dashboard.directLeaderCount} / ${dashboard.directLeaderCapacity} líderes`,
  };

  return {
    person: person
      ? { ...person, id: person._id as string, fullName: formatFullName(person.firstName, person.lastName) }
      : null,
    leadership: { ...leadership, id: leadership._id as string },
    ministry,
    network,
    cells: ownCells,
    progress,
    directLeaders: directs,
    descendantLeaders: dashboard.descendantCount,
    eligiblePending: eligiblePendingRaw.map((e) => ({
      personId: e.personId as string,
      firstName: e.firstName,
      lastName: e.lastName,
      fullName: formatFullName(e.firstName, e.lastName),
    })),
    readyForTwelve: dashboard.readyForTwelve,
  };
}

export async function getBreadcrumbs(actorUserId: string, personId: string) {
  const actor = await requireActor(actorUserId);
  const leadership = await getLeadership(personId);
  if (!leadership) return [];
  await assertTreeAccess(actor, personId, leadership.ministryId as string);

  const client = getConvexHttpClient();
  const ancestors = await client.query(api.leadership.listAncestors, {
    personId: personId as Id<"persons">,
  });

  const sorted = [...ancestors].sort((a, b) => b.depth - a.depth);
  return sorted.map((a) => ({
    personId: a.personId as string,
    humanLeaderCode: a.humanLeaderCode ?? null,
    fullName: formatFullName(a.firstName, a.lastName),
    depthFromSelf: a.depth,
  }));
}

export async function countsAsTwelveLeader(personId: string): Promise<boolean> {
  const leadership = await getLeadership(personId);
  if (!leadership || leadership.status !== "active" || !leadership.primaryCellId) {
    return false;
  }
  const client = getConvexHttpClient();
  const cell = await client.query(api.cells.getById, { cellId: leadership.primaryCellId });
  return Boolean(cell && cell.status === "active");
}

export async function convertEvangelisticCellToTwelve(
  actorUserId: string,
  raw: ConvertTwelveInput,
) {
  const actor = await requireActor(actorUserId);
  const input = convertTwelveInputSchema.parse(raw);
  const client = getConvexHttpClient();

  const cell = await client.query(api.cells.getById, { cellId: input.cellId as Id<"cells"> });
  if (!cell || cell.type !== "evangelistic" || cell.status !== "active") {
    throw new DomainError(DomainErrorCode.CELL_NOT_FOUND, "Célula evangelística no encontrada.");
  }
  if (!cell.responsiblePersonId) {
    throw new DomainError(DomainErrorCode.LEADER_REQUIRES_CELL, "La célula no tiene responsable.");
  }
  const responsiblePersonId = cell.responsiblePersonId;

  assertCanMutate(actor, "g12.convert_twelve", {
    type: "cell",
    id: cell._id as string,
    ministryId: cell.ministryId as string,
  });
  await assertTreeAccess(actor, responsiblePersonId as string, cell.ministryId as string);

  const progress = await getTwelveProgress(responsiblePersonId as string);
  if (!progress.ready) {
    throw new DomainError(
      DomainErrorCode.TWELVE_REQUIRES_12_ACTIVE_LEADERS,
      `Se requieren 12 líderes activos. Actual: ${progress.current}.`,
    );
  }

  const detail = await client.query(api.cells.getDetail, { cellId: cell._id });
  const activeMembers = detail ? detail.members.filter((m) => m.status === "active") : [];

  const ordinary: typeof activeMembers = [];
  const leaders: typeof activeMembers = [];
  for (const m of activeMembers) {
    if (await countsAsTwelveLeader(m.personId as string)) {
      leaders.push(m);
    } else {
      ordinary.push(m);
    }
  }

  const directLeaders = await client.query(api.leadership.listDirectLeaders, {
    leaderPersonId: responsiblePersonId,
  });

  if (directLeaders.length < MAX_DIRECT_LEADERS) {
    throw new DomainError(
      DomainErrorCode.TWELVE_NOT_READY,
      "Aún no hay 12 líderes directos activos.",
    );
  }

  const unresolvedOrdinary = ordinary.filter(
    (m) => !input.ordinaryMemberPersonIds.includes(m.personId as string),
  );
  if (unresolvedOrdinary.length > 0 && input.ordinaryMemberPersonIds.length === 0) {
    throw new DomainError(
      DomainErrorCode.TWELVE_HAS_ORDINARY_MEMBERS,
      "Hay miembros ordinarios que deben resolverse antes de convertir.",
      { count: unresolvedOrdinary.length },
    );
  }

  const existingCells = await client.query(api.cells.listByResponsible, {
    responsiblePersonId,
  });
  if (existingCells.some((c) => c.type === "twelve" && c.status !== "closed")) {
    throw new DomainError(
      DomainErrorCode.MAX_DIRECT_CELLS_REACHED,
      "El líder ya tiene una Célula de 12.",
    );
  }

  const twelve = await client
    .mutation(api.cells.convertToTwelve, { cellId: cell._id })
    .catch(mapConvexError);

  let evangelistic =
    existingCells.find(
      (c) => c.type === "evangelistic" && c._id !== cell._id && c.status === "active",
    ) ?? null;

  if (ordinary.length > 0 || input.ordinaryMemberPersonIds.length > 0) {
    if (!evangelistic) {
      if (existingCells.filter((c) => c.status !== "closed").length >= 2) {
        throw new DomainError(
          DomainErrorCode.MAX_DIRECT_CELLS_REACHED,
          "No se puede abrir otra evangelística: máximo 2 células.",
        );
      }
      evangelistic = await client
        .mutation(api.cells.create, {
          name: input.evangelisticCellName?.trim() || `${cell.name} — Evangelística`,
          type: "evangelistic",
          ministryId: cell.ministryId,
          networkId: cell.networkId,
          responsiblePersonId,
          dayOfWeek: cell.dayOfWeek,
          startTime: cell.startTime,
          timezone: cell.timezone,
        })
        .catch(mapConvexError);
    }

    const moveIds =
      input.ordinaryMemberPersonIds.length > 0
        ? input.ordinaryMemberPersonIds
        : ordinary.map((o) => o.personId as string);

    for (const personId of moveIds) {
      const membership = activeMembers.find((m) => (m.personId as string) === personId);
      if (!membership) continue;
      await client
        .mutation(api.cells.reassignMember, {
          membershipId: membership.membershipId,
          targetCellId: evangelistic._id,
          reason: "Conversión a Célula de 12",
        })
        .catch(mapConvexError);
    }
  }

  const twelveDetail = await client.query(api.cells.getDetail, { cellId: twelve._id });
  const twelveActiveByPerson = new Map(
    (twelveDetail?.members ?? [])
      .filter((m) => m.status === "active")
      .map((m) => [m.personId as string, m]),
  );

  for (const leader of directLeaders) {
    const existing = twelveActiveByPerson.get(leader.personId as string);
    if (!existing) {
      await client
        .mutation(api.cells.addMember, {
          cellId: twelve._id,
          personId: leader.personId,
          role: "twelve_team",
        })
        .catch(mapConvexError);
    } else if (existing.role !== "twelve_team") {
      await client
        .mutation(api.cells.setMembershipRole, {
          membershipId: existing.membershipId,
          role: "twelve_team",
        })
        .catch(mapConvexError);
    }
  }

  const finalDetail = await client.query(api.cells.getDetail, { cellId: twelve._id });
  const remaining = (finalDetail?.members ?? []).filter((m) => m.status === "active");
  for (const m of remaining) {
    if (m.role === "twelve_team") continue;
    const ok = await countsAsTwelveLeader(m.personId as string);
    if (!ok) {
      throw new DomainError(
        DomainErrorCode.TWELVE_MEMBER_NOT_ACTIVE_LEADER,
        "La Célula de 12 solo admite líderes activos.",
        { personId: m.personId },
      );
    }
  }

  await writeAuditLog({
    actorUserId,
    action: "g12.twelve_converted",
    entityType: "cell",
    entityId: twelve._id,
    metadata: {
      responsiblePersonId,
      evangelisticCellId: evangelistic?._id ?? null,
      leaderCount: directLeaders.length,
    },
  });

  return {
    twelve: { ...twelve, id: twelve._id as string },
    evangelistic: evangelistic ? { ...evangelistic, id: evangelistic._id as string } : null,
  };
}

export async function listDescendantLeaderIds(ancestorPersonId: string) {
  const client = getConvexHttpClient();
  const rows = await client.query(api.leadership.listDescendants, {
    ancestorPersonId: ancestorPersonId as Id<"persons">,
  });
  return rows.map((r) => ({ personId: r.personId as string, depth: r.depth }));
}

/** Pure helpers exported for unit tests */
export const LeadershipRules = {
  MAX_DIRECT_LEADERS,
  countsAsLeaderForTwelve(params: {
    status: string;
    hasActiveOwnCell: boolean;
  }) {
    return params.status === "active" && params.hasActiveOwnCell;
  },
  canAddThirteenthDirect(currentDirectActive: number) {
    return currentDirectActive < MAX_DIRECT_LEADERS;
  },
  twelveReady(currentDirectActive: number) {
    return currentDirectActive >= MAX_DIRECT_LEADERS;
  },
};
