import { and, asc, count, eq, gt, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  cells,
  cellMemberships,
  leadershipClosure,
  ministries,
  networks,
  personLeadership,
  personOrganizationHistory,
  persons,
  roles,
  userRoleAssignments,
  users,
} from "@/db/schema";
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
import { createServiceRoleClient } from "@/server/supabase/admin";

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
  const db = getDb();
  const [row] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, personId))
    .limit(1);
  return row ?? null;
}

export async function isDescendantOf(
  ancestorPersonId: string,
  descendantPersonId: string,
): Promise<boolean> {
  if (ancestorPersonId === descendantPersonId) return true;
  const db = getDb();
  const [row] = await db
    .select({ depth: leadershipClosure.depth })
    .from(leadershipClosure)
    .where(
      and(
        eq(leadershipClosure.ancestorPersonId, ancestorPersonId),
        eq(leadershipClosure.descendantPersonId, descendantPersonId),
        gt(leadershipClosure.depth, 0),
      ),
    )
    .limit(1);
  return Boolean(row);
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
    .limit(1);
  return row ?? null;
}

async function countDirectActiveLeaders(leaderPersonId: string) {
  const db = getDb();
  const [{ c }] = await db
    .select({ c: count() })
    .from(personLeadership)
    .where(
      and(
        eq(personLeadership.directLeaderPersonId, leaderPersonId),
        eq(personLeadership.status, "active"),
      ),
    );
  return Number(c);
}

async function wouldCreateCycle(personId: string, proposedDirectLeaderId: string) {
  // If proposed leader is already a descendant of person, cycle.
  return isDescendantOf(personId, proposedDirectLeaderId);
}

async function rebuildClosureForPerson(
  personId: string,
  directLeaderPersonId: string | null,
  ministryId: string,
) {
  const db = getDb();
  await db
    .delete(leadershipClosure)
    .where(eq(leadershipClosure.descendantPersonId, personId));

  await db.insert(leadershipClosure).values({
    ancestorPersonId: personId,
    descendantPersonId: personId,
    depth: 0,
    ministryId,
  });

  if (!directLeaderPersonId) return;

  const ancestors = await db
    .select()
    .from(leadershipClosure)
    .where(eq(leadershipClosure.descendantPersonId, directLeaderPersonId));

  if (ancestors.length === 0) {
    await db.insert(leadershipClosure).values({
      ancestorPersonId: directLeaderPersonId,
      descendantPersonId: personId,
      depth: 1,
      ministryId,
    });
    return;
  }

  await db.insert(leadershipClosure).values(
    ancestors.map((a) => ({
      ancestorPersonId: a.ancestorPersonId,
      descendantPersonId: personId,
      depth: a.depth + 1,
      ministryId,
    })),
  );
}

async function allocateUsername(firstName: string, lastName: string) {
  const db = getDb();
  const base = buildUsernameBase(firstName, lastName);
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = nextUsernameCandidate(base, attempt);
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new DomainError(DomainErrorCode.USERNAME_COLLISION, "No se pudo generar username único.");
}

async function allocateHumanCode(directLeaderPersonId: string | null, ministryId: string) {
  const db = getDb();
  if (!directLeaderPersonId) {
    const [ministry] = await db
      .select()
      .from(ministries)
      .where(eq(ministries.id, ministryId))
      .limit(1);
    const base = ministry?.code ?? `M${ministryId.slice(0, 4)}`;
    const [taken] = await db
      .select({ id: personLeadership.id })
      .from(personLeadership)
      .where(eq(personLeadership.humanLeaderCode, base))
      .limit(1);
    if (!taken) return base;
    for (let n = 2; n <= 99; n += 1) {
      const candidate = `${base}-R${n}`;
      const [exists] = await db
        .select({ id: personLeadership.id })
        .from(personLeadership)
        .where(eq(personLeadership.humanLeaderCode, candidate))
        .limit(1);
      if (!exists) return candidate;
    }
    throw new DomainError(
      DomainErrorCode.USERNAME_COLLISION,
      "No se pudo asignar código humano de raíz.",
    );
  }

  const [parent] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, directLeaderPersonId))
    .limit(1);
  const parentCode = parent?.humanLeaderCode;
  if (!parentCode) {
    throw new DomainError(
      DomainErrorCode.DIRECT_LEADER_INVALID,
      "El líder directo no tiene código humano.",
    );
  }

  const siblings = await db
    .select({ humanLeaderCode: personLeadership.humanLeaderCode })
    .from(personLeadership)
    .where(eq(personLeadership.directLeaderPersonId, directLeaderPersonId));

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

  const db = getDb();
  const intendedDirectLeader =
    input.directLeaderPersonId === undefined
      ? actor.personId
      : input.directLeaderPersonId;

  if (existing) {
    const [row] = await db
      .update(personLeadership)
      .set({
        status: "eligible",
        ministryId: input.ministryId,
        networkId: input.networkId,
        directLeaderPersonId: intendedDirectLeader,
        eligibleAt: new Date(),
        eligibleByUserId: actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(personLeadership.personId, input.personId))
      .returning();
    await writeAuditLog({
      actorUserId,
      action: "leader.marked_eligible",
      entityType: "person_leadership",
      entityId: row.id,
      metadata: {
        personId: input.personId,
        ministryId: input.ministryId,
        directLeaderPersonId: intendedDirectLeader,
      },
    });
    return row;
  }

  const [row] = await db
    .insert(personLeadership)
    .values({
      personId: input.personId,
      status: "eligible",
      ministryId: input.ministryId,
      networkId: input.networkId,
      directLeaderPersonId: intendedDirectLeader,
      eligibleAt: new Date(),
      eligibleByUserId: actorUserId,
    })
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "leader.marked_eligible",
    entityType: "person_leadership",
    entityId: row.id,
    metadata: {
      personId: input.personId,
      ministryId: input.ministryId,
      directLeaderPersonId: intendedDirectLeader,
    },
  });
  return row;
}

export async function activateLeader(actorUserId: string, raw: unknown) {
  const actor = await requireActor(actorUserId);
  const input = activateLeaderInputSchema.parse(raw);
  const db = getDb();

  const [person] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, input.personId), isNull(persons.deletedAt)))
    .limit(1);
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
    : (input.directLeaderPersonId ?? leadership.directLeaderPersonId ?? null);

  await assertCanActivate(
    actor,
    input.personId,
    org.ministryId,
    directLeaderPersonId,
    isRoot,
  );

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
    if (parent.ministryId !== org.ministryId) {
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
    (input.email && input.email.trim()) ||
    person.email ||
    `${username}@multiplica.local`;
  const temporaryPassword = generateTemporaryPassword();

  // Credential provisioning outside DB transaction (Auth), then DB work.
  let authUserId: string | null = null;
  let provisionedNew = false;
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.personId, input.personId))
    .limit(1);

  try {
    const admin = createServiceRoleClient();
    if (existingUser) {
      authUserId = existingUser.id;
      await db
        .update(users)
        .set({
          username: existingUser.username ?? username,
          email: existingUser.email || email,
          displayName: formatFullName(person.firstName, person.lastName),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id));
    } else {
      const created = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          username,
          must_change_password: true,
          person_id: input.personId,
        },
      });
      if (!created.data.user) {
        throw new DomainError(
          DomainErrorCode.CREDENTIAL_PROVISION_FAILED,
          created.error?.message ?? "No se pudo crear usuario Auth.",
        );
      }
      authUserId = created.data.user.id;
      provisionedNew = true;
      await db.insert(users).values({
        id: authUserId,
        personId: input.personId,
        email,
        username,
        displayName: formatFullName(person.firstName, person.lastName),
        mustChangePassword: true,
        isActive: true,
      });
    }

    const [leaderRole] = await db.select().from(roles).where(eq(roles.code, "leader")).limit(1);
    if (leaderRole && authUserId) {
      const [existingAssign] = await db
        .select()
        .from(userRoleAssignments)
        .where(
          and(
            eq(userRoleAssignments.userId, authUserId),
            eq(userRoleAssignments.roleId, leaderRole.id),
            isNull(userRoleAssignments.endsAt),
          ),
        )
        .limit(1);
      if (!existingAssign) {
        await db.insert(userRoleAssignments).values({
          userId: authUserId,
          roleId: leaderRole.id,
          ministryId: org.ministryId,
          networkId: org.networkId,
          createdByUserId: actorUserId,
        });
      }
    }

    const result = await db.transaction(async (tx) => {
      const [cell] = await tx
        .insert(cells)
        .values({
          name: input.cell.name.trim(),
          type: "evangelistic",
          ministryId: org.ministryId!,
          networkId: org.networkId!,
          responsiblePersonId: input.personId,
          responsibleUserId: authUserId,
          dayOfWeek: input.cell.dayOfWeek,
          startTime: input.cell.startTime,
          timezone: "America/Lima",
          address: input.cell.address?.trim() || null,
          districtId:
            input.cell.districtId && input.cell.districtId !== ""
              ? input.cell.districtId
              : null,
          status: "active",
        })
        .returning();

      const [updated] = await tx
        .update(personLeadership)
        .set({
          status: "active",
          ministryId: org.ministryId!,
          networkId: org.networkId!,
          directLeaderPersonId,
          primaryCellId: cell.id,
          humanLeaderCode,
          isMinistryRoot: isRoot,
          activatedAt: new Date(),
          activatedByUserId: actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(personLeadership.personId, input.personId))
        .returning();

      // If direct leader already has a Célula de 12 with capacity, add twelve_team membership
      if (directLeaderPersonId) {
        const [twelveCell] = await tx
          .select()
          .from(cells)
          .where(
            and(
              eq(cells.responsiblePersonId, directLeaderPersonId),
              eq(cells.type, "twelve"),
              eq(cells.status, "active"),
            ),
          )
          .limit(1);
        if (twelveCell) {
          const [{ c }] = await tx
            .select({ c: count() })
            .from(cellMemberships)
            .where(
              and(
                eq(cellMemberships.cellId, twelveCell.id),
                eq(cellMemberships.status, "active"),
              ),
            );
          if (Number(c) < MAX_DIRECT_LEADERS) {
            await tx.insert(cellMemberships).values({
              cellId: twelveCell.id,
              personId: input.personId,
              status: "active",
              role: "twelve_team",
            });
          }
        }
      }

      return { cell, leadership: updated };
    });

    await rebuildClosureForPerson(input.personId, directLeaderPersonId, org.ministryId);

    await writeAuditLog({
      actorUserId,
      action: "leader.activated",
      entityType: "person_leadership",
      entityId: result.leadership.id,
      metadata: {
        personId: input.personId,
        cellId: result.cell.id,
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
      entityId: authUserId,
      metadata: {
        personId: input.personId,
        username,
        provisionedNew,
        // Never include password
      },
    });
    await writeAuditLog({
      actorUserId,
      action: "leader.role_assigned",
      entityType: "user",
      entityId: authUserId,
      metadata: { role: "leader", ministryId: org.ministryId },
    });

    return {
      leadership: result.leadership,
      cell: result.cell,
      username,
      email,
      temporaryPassword: provisionedNew ? temporaryPassword : null,
      mustChangePassword: provisionedNew,
    };
  } catch (error) {
    if (provisionedNew && authUserId) {
      try {
        const admin = createServiceRoleClient();
        await admin.auth.admin.deleteUser(authUserId);
        await db.delete(users).where(eq(users.id, authUserId));
      } catch {
        // best-effort rollback of auth user
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
    ministryId: leadership.ministryId,
    personId,
  });

  const db = getDb();
  const directCount = await countDirectActiveLeaders(personId);
  const [{ cellsCount }] = await db
    .select({ cellsCount: count() })
    .from(cells)
    .where(
      and(
        eq(cells.responsiblePersonId, personId),
        sql`${cells.status} <> 'closed'`,
      ),
    );

  if (directCount > 0 || Number(cellsCount) > 0) {
    throw new DomainError(
      DomainErrorCode.LEADER_HAS_ACTIVE_STRUCTURE,
      "No se puede desactivar: hay células o líderes directos. Requiere plan de reasignación (fase posterior).",
      { directCount, cellsCount: Number(cellsCount) },
    );
  }

  const [row] = await db
    .update(personLeadership)
    .set({
      status: "inactive",
      deactivatedAt: new Date(),
      deactivatedByUserId: actorUserId,
      updatedAt: new Date(),
    })
    .where(eq(personLeadership.personId, personId))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "leader.deactivated",
    entityType: "person_leadership",
    entityId: row.id,
    metadata: { personId },
  });
  return row;
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
  await assertTreeAccess(actor, leaderPersonId, leadership.ministryId);
  assertCanMutate(actor, "leaders.read", {
    type: "leader",
    ministryId: leadership.ministryId,
  });

  const db = getDb();
  const rows = await db
    .select({
      personId: personLeadership.personId,
      humanLeaderCode: personLeadership.humanLeaderCode,
      status: personLeadership.status,
      primaryCellId: personLeadership.primaryCellId,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(personLeadership)
    .innerJoin(persons, eq(persons.id, personLeadership.personId))
    .where(
      and(
        eq(personLeadership.directLeaderPersonId, leaderPersonId),
        eq(personLeadership.status, "active"),
      ),
    )
    .orderBy(asc(personLeadership.humanLeaderCode));

  return rows.map((r) => ({
    ...r,
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

  const leadership = await getLeadership(personId);
  if (!leadership) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Sin registro de liderazgo.");
  }
  await assertTreeAccess(actor, personId, leadership.ministryId);

  const db = getDb();
  const ownCells = await db
    .select()
    .from(cells)
    .where(
      and(eq(cells.responsiblePersonId, personId), sql`${cells.status} <> 'closed'`),
    );
  const progress = await getTwelveProgress(personId);
  const directs = await listDirectLeaders(actorUserId, personId);

  const [{ descendants }] = await db
    .select({ descendants: count() })
    .from(leadershipClosure)
    .where(
      and(
        eq(leadershipClosure.ancestorPersonId, personId),
        gt(leadershipClosure.depth, 0),
      ),
    );

  const [person] = await db.select().from(persons).where(eq(persons.id, personId)).limit(1);
  const [ministry] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.id, leadership.ministryId))
    .limit(1);
  const [network] = await db
    .select()
    .from(networks)
    .where(eq(networks.id, leadership.networkId))
    .limit(1);

  const eligiblePending = await db
    .select({
      personId: personLeadership.personId,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(personLeadership)
    .innerJoin(persons, eq(persons.id, personLeadership.personId))
    .where(
      and(
        eq(personLeadership.ministryId, leadership.ministryId),
        eq(personLeadership.status, "eligible"),
        eq(personLeadership.directLeaderPersonId, personId),
      ),
    )
    .limit(20);

  return {
    person: person
      ? { ...person, fullName: formatFullName(person.firstName, person.lastName) }
      : null,
    leadership,
    ministry,
    network,
    cells: ownCells,
    progress,
    directLeaders: directs,
    descendantLeaders: Number(descendants),
    eligiblePending: eligiblePending.map((e) => ({
      ...e,
      fullName: formatFullName(e.firstName, e.lastName),
    })),
    readyForTwelve: progress.ready,
  };
}

export async function getBreadcrumbs(actorUserId: string, personId: string) {
  const actor = await requireActor(actorUserId);
  const leadership = await getLeadership(personId);
  if (!leadership) return [];
  await assertTreeAccess(actor, personId, leadership.ministryId);

  const db = getDb();
  const ancestors = await db
    .select({
      personId: leadershipClosure.ancestorPersonId,
      depth: leadershipClosure.depth,
      humanLeaderCode: personLeadership.humanLeaderCode,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(leadershipClosure)
    .innerJoin(persons, eq(persons.id, leadershipClosure.ancestorPersonId))
    .leftJoin(
      personLeadership,
      eq(personLeadership.personId, leadershipClosure.ancestorPersonId),
    )
    .where(eq(leadershipClosure.descendantPersonId, personId))
    .orderBy(asc(leadershipClosure.depth));

  // ancestors query returns depth from ancestor to person; we need path root→leaf
  // Actually closure stores ancestor→descendant depth. For person P, rows are (A,P,d).
  // Sort by depth DESC to get root first? depth 0 is self. Depth max is root.
  const sorted = [...ancestors].sort((a, b) => b.depth - a.depth);
  return sorted.map((a) => ({
    personId: a.personId,
    humanLeaderCode: a.humanLeaderCode,
    fullName: formatFullName(a.firstName, a.lastName),
    depthFromSelf: a.depth,
  }));
}

export async function countsAsTwelveLeader(personId: string): Promise<boolean> {
  const leadership = await getLeadership(personId);
  if (!leadership || leadership.status !== "active" || !leadership.primaryCellId) {
    return false;
  }
  const db = getDb();
  const [cell] = await db
    .select()
    .from(cells)
    .where(and(eq(cells.id, leadership.primaryCellId), eq(cells.status, "active")))
    .limit(1);
  return Boolean(cell);
}

export async function convertEvangelisticCellToTwelve(
  actorUserId: string,
  raw: ConvertTwelveInput,
) {
  const actor = await requireActor(actorUserId);
  const input = convertTwelveInputSchema.parse(raw);
  const db = getDb();

  const [cell] = await db.select().from(cells).where(eq(cells.id, input.cellId)).limit(1);
  if (!cell || cell.type !== "evangelistic" || cell.status !== "active") {
    throw new DomainError(DomainErrorCode.CELL_NOT_FOUND, "Célula evangelística no encontrada.");
  }
  if (!cell.responsiblePersonId) {
    throw new DomainError(DomainErrorCode.LEADER_REQUIRES_CELL, "La célula no tiene responsable.");
  }

  assertCanMutate(actor, "g12.convert_twelve", {
    type: "cell",
    id: cell.id,
    ministryId: cell.ministryId,
  });
  await assertTreeAccess(actor, cell.responsiblePersonId, cell.ministryId);

  const progress = await getTwelveProgress(cell.responsiblePersonId);
  if (!progress.ready) {
    throw new DomainError(
      DomainErrorCode.TWELVE_REQUIRES_12_ACTIVE_LEADERS,
      `Se requieren 12 líderes activos. Actual: ${progress.current}.`,
    );
  }

  const activeMembers = await db
    .select()
    .from(cellMemberships)
    .where(and(eq(cellMemberships.cellId, cell.id), eq(cellMemberships.status, "active")));

  const ordinary: typeof activeMembers = [];
  const leaders: typeof activeMembers = [];
  for (const m of activeMembers) {
    if (await countsAsTwelveLeader(m.personId)) {
      leaders.push(m);
    } else {
      ordinary.push(m);
    }
  }

  // Direct leaders of responsible should be the twelve team
  const directLeaders = await db
    .select()
    .from(personLeadership)
    .where(
      and(
        eq(personLeadership.directLeaderPersonId, cell.responsiblePersonId),
        eq(personLeadership.status, "active"),
      ),
    );

  if (directLeaders.length < MAX_DIRECT_LEADERS) {
    throw new DomainError(
      DomainErrorCode.TWELVE_NOT_READY,
      "Aún no hay 12 líderes directos activos.",
    );
  }

  const unresolvedOrdinary = ordinary.filter(
    (m) => !input.ordinaryMemberPersonIds.includes(m.personId),
  );
  if (unresolvedOrdinary.length > 0 && input.ordinaryMemberPersonIds.length === 0) {
    throw new DomainError(
      DomainErrorCode.TWELVE_HAS_ORDINARY_MEMBERS,
      "Hay miembros ordinarios que deben resolverse antes de convertir.",
      { count: unresolvedOrdinary.length },
    );
  }

  // Ensure leader doesn't already have a twelve cell
  const existingCells = await db
    .select()
    .from(cells)
    .where(
      and(
        eq(cells.responsiblePersonId, cell.responsiblePersonId),
        sql`${cells.status} <> 'closed'`,
      ),
    );
  if (existingCells.some((c) => c.type === "twelve")) {
    throw new DomainError(
      DomainErrorCode.MAX_DIRECT_CELLS_REACHED,
      "El líder ya tiene una Célula de 12.",
    );
  }

  const result = await db.transaction(async (tx) => {
    // Convert this cell to twelve
    const [twelve] = await tx
      .update(cells)
      .set({ type: "twelve", updatedAt: new Date() })
      .where(eq(cells.id, cell.id))
      .returning();

    // Move ordinary members to a (new or existing) evangelistic cell
    let evangelistic = existingCells.find(
      (c) => c.type === "evangelistic" && c.id !== cell.id && c.status === "active",
    );
    if (ordinary.length > 0 || input.ordinaryMemberPersonIds.length > 0) {
      if (!evangelistic) {
        if (existingCells.filter((c) => c.status !== "closed").length >= 2) {
          throw new DomainError(
            DomainErrorCode.MAX_DIRECT_CELLS_REACHED,
            "No se puede abrir otra evangelística: máximo 2 células.",
          );
        }
        const [created] = await tx
          .insert(cells)
          .values({
            name:
              input.evangelisticCellName?.trim() ||
              `${cell.name} — Evangelística`,
            type: "evangelistic",
            ministryId: cell.ministryId,
            networkId: cell.networkId,
            responsiblePersonId: cell.responsiblePersonId,
            dayOfWeek: cell.dayOfWeek,
            startTime: cell.startTime,
            timezone: cell.timezone,
            status: "active",
          })
          .returning();
        evangelistic = created;
      }

      const moveIds =
        input.ordinaryMemberPersonIds.length > 0
          ? input.ordinaryMemberPersonIds
          : ordinary.map((o) => o.personId);

      for (const personId of moveIds) {
        const membership = activeMembers.find((m) => m.personId === personId);
        if (!membership) continue;
        await tx
          .update(cellMemberships)
          .set({
            status: "transferred",
            leftAt: new Date(),
            leaveReason: "Conversión a Célula de 12",
            updatedAt: new Date(),
          })
          .where(eq(cellMemberships.id, membership.id));
        await tx.insert(cellMemberships).values({
          cellId: evangelistic.id,
          personId,
          status: "active",
          role: "member",
        });
      }
    }

    // Ensure twelve_team memberships for each direct leader
    for (const leader of directLeaders) {
      const [existing] = await tx
        .select()
        .from(cellMemberships)
        .where(
          and(
            eq(cellMemberships.cellId, twelve.id),
            eq(cellMemberships.personId, leader.personId),
            eq(cellMemberships.status, "active"),
          ),
        )
        .limit(1);
      if (!existing) {
        await tx.insert(cellMemberships).values({
          cellId: twelve.id,
          personId: leader.personId,
          status: "active",
          role: "twelve_team",
        });
      } else if (existing.role !== "twelve_team") {
        await tx
          .update(cellMemberships)
          .set({ role: "twelve_team", updatedAt: new Date() })
          .where(eq(cellMemberships.id, existing.id));
      }
    }

    // Reject any remaining non-leader active memberships
    const remaining = await tx
      .select()
      .from(cellMemberships)
      .where(and(eq(cellMemberships.cellId, twelve.id), eq(cellMemberships.status, "active")));
    for (const m of remaining) {
      if (m.role === "twelve_team") continue;
      const ok = await countsAsTwelveLeader(m.personId);
      if (!ok) {
        throw new DomainError(
          DomainErrorCode.TWELVE_MEMBER_NOT_ACTIVE_LEADER,
          "La Célula de 12 solo admite líderes activos.",
          { personId: m.personId },
        );
      }
    }

    return { twelve, evangelistic: evangelistic ?? null };
  });

  await writeAuditLog({
    actorUserId,
    action: "g12.twelve_converted",
    entityType: "cell",
    entityId: result.twelve.id,
    metadata: {
      responsiblePersonId: cell.responsiblePersonId,
      evangelisticCellId: result.evangelistic?.id ?? null,
      leaderCount: directLeaders.length,
    },
  });

  return result;
}

export async function listDescendantLeaderIds(ancestorPersonId: string) {
  const db = getDb();
  const rows = await db
    .select({
      personId: leadershipClosure.descendantPersonId,
      depth: leadershipClosure.depth,
    })
    .from(leadershipClosure)
    .where(
      and(
        eq(leadershipClosure.ancestorPersonId, ancestorPersonId),
        gt(leadershipClosure.depth, 0),
      ),
    );
  return rows;
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
