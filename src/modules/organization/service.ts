import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import {
  ministries,
  networks,
  roles,
  userRoleAssignments,
  users,
} from "@/db/schema";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { isValidHumanCode } from "@/lib/human-codes";
import { writeAuditLog } from "@/modules/audit";
import {
  assertCanMutate,
  assertCanView,
  canAccessMinistry,
  isSuperadmin,
  loadAuthContext,
  type AuthContext,
} from "@/modules/authorization";

export const ministryInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9]+$/, "El código debe ser alfanumérico (ej. LP1)."),
  name: z.string().trim().min(2).max(120),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export type MinistryInput = z.infer<typeof ministryInputSchema>;

async function requireActor(userId: string): Promise<AuthContext> {
  return loadAuthContext(userId);
}

export async function listMinistriesForActor(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  assertCanView(actor, { type: "ministry" });

  const db = getDb();
  const rows = await db
    .select({
      id: ministries.id,
      code: ministries.code,
      name: ministries.name,
      isActive: ministries.isActive,
      sortOrder: ministries.sortOrder,
      responsibleUserId: ministries.responsibleUserId,
      responsibleEmail: users.email,
      responsibleDisplayName: users.displayName,
      createdAt: ministries.createdAt,
      updatedAt: ministries.updatedAt,
    })
    .from(ministries)
    .leftJoin(users, eq(ministries.responsibleUserId, users.id))
    .orderBy(asc(ministries.sortOrder), asc(ministries.code));

  if (isSuperadmin(actor)) {
    return rows;
  }

  return rows.filter((row) => canAccessMinistry(actor, row.id));
}

export async function getMinistryForActor(actorUserId: string, ministryId: string) {
  const actor = await requireActor(actorUserId);
  assertCanView(actor, { type: "ministry", id: ministryId });

  const db = getDb();
  const [row] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.id, ministryId))
    .limit(1);

  if (!row) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no encontrado.");
  }
  return row;
}

export async function createMinistry(actorUserId: string, input: MinistryInput) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministry.manage", { type: "ministry" });

  const parsed = ministryInputSchema.parse(input);
  if (!isValidHumanCode(parsed.code)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Código humano inválido.");
  }

  const db = getDb();
  const existing = await db
    .select({ id: ministries.id })
    .from(ministries)
    .where(eq(ministries.code, parsed.code))
    .limit(1);
  if (existing.length > 0) {
    throw new DomainError(DomainErrorCode.CONFLICT, "Ya existe un ministerio con ese código.");
  }

  const [created] = await db
    .insert(ministries)
    .values({
      code: parsed.code,
      name: parsed.name,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    })
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "ministry.create",
    entityType: "ministry",
    entityId: created.id,
    afterData: created,
  });

  return created;
}

export async function updateMinistry(
  actorUserId: string,
  ministryId: string,
  input: Partial<MinistryInput>,
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministry.manage", { type: "ministry", id: ministryId });

  const db = getDb();
  const [before] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.id, ministryId))
    .limit(1);
  if (!before) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no encontrado.");
  }

  const parsed = ministryInputSchema.partial().parse(input);
  if (parsed.code && parsed.code !== before.code) {
    const clash = await db
      .select({ id: ministries.id })
      .from(ministries)
      .where(eq(ministries.code, parsed.code))
      .limit(1);
    if (clash.length > 0) {
      throw new DomainError(DomainErrorCode.CONFLICT, "Ya existe un ministerio con ese código.");
    }
  }

  const [after] = await db
    .update(ministries)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(ministries.id, ministryId))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: "ministry.update",
    entityType: "ministry",
    entityId: ministryId,
    beforeData: before,
    afterData: after,
  });

  return after;
}

export async function setMinistryActive(
  actorUserId: string,
  ministryId: string,
  isActive: boolean,
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministry.manage", { type: "ministry", id: ministryId });

  const db = getDb();
  const [before] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.id, ministryId))
    .limit(1);
  if (!before) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no encontrado.");
  }

  const [after] = await db
    .update(ministries)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(ministries.id, ministryId))
    .returning();

  await writeAuditLog({
    actorUserId,
    action: isActive ? "ministry.activate" : "ministry.deactivate",
    entityType: "ministry",
    entityId: ministryId,
    beforeData: before,
    afterData: after,
  });

  return after;
}

/**
 * Assigns Líder General: sets ministries.responsible_user_id and ensures an
 * active user_role_assignments row with role leader_general + ministry scope.
 */
export async function assignMinistryResponsible(
  actorUserId: string,
  ministryId: string,
  responsibleUserId: string | null,
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "users.assign_roles", { type: "ministry", id: ministryId });

  const db = getDb();
  const [before] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.id, ministryId))
    .limit(1);
  if (!before) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no encontrado.");
  }

  if (responsibleUserId) {
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, responsibleUserId))
      .limit(1);
    if (!targetUser || !targetUser.isActive) {
      throw new DomainError(DomainErrorCode.NOT_FOUND, "Usuario responsable no encontrado o inactivo.");
    }
  }

  const [leaderGeneralRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.code, "leader_general"))
    .limit(1);
  if (!leaderGeneralRole) {
    throw new DomainError(
      DomainErrorCode.CONFIGURATION_ERROR,
      "Rol leader_general no está seedado.",
    );
  }

  await db.transaction(async (tx) => {
    // End previous leader_general assignment for this ministry
    await tx
      .update(userRoleAssignments)
      .set({ endsAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(userRoleAssignments.ministryId, ministryId),
          eq(userRoleAssignments.roleId, leaderGeneralRole.id),
          isNull(userRoleAssignments.endsAt),
        ),
      );

    if (responsibleUserId) {
      await tx.insert(userRoleAssignments).values({
        userId: responsibleUserId,
        roleId: leaderGeneralRole.id,
        ministryId,
        createdByUserId: actorUserId,
      });
    }

    await tx
      .update(ministries)
      .set({
        responsibleUserId,
        updatedAt: new Date(),
      })
      .where(eq(ministries.id, ministryId));
  });

  const [after] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.id, ministryId))
    .limit(1);

  await writeAuditLog({
    actorUserId,
    action: "ministry.assign_leader_general",
    entityType: "ministry",
    entityId: ministryId,
    beforeData: before,
    afterData: after,
    reason: responsibleUserId
      ? "Asignación de Líder General"
      : "Remoción de Líder General",
  });

  return after;
}

export async function listNetworksForActor(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  assertCanView(actor, { type: "network" });

  const db = getDb();
  return db.select().from(networks).orderBy(asc(networks.sortOrder));
}

export async function listUsersForAdmin(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "users.read", { type: "user" });

  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      isActive: users.isActive,
      personId: users.personId,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.email));

  return rows;
}

export async function listUserRoleAssignments(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "users.read", { type: "user" });

  const db = getDb();
  return db
    .select({
      id: userRoleAssignments.id,
      userId: userRoleAssignments.userId,
      roleCode: roles.code,
      ministryId: userRoleAssignments.ministryId,
      networkId: userRoleAssignments.networkId,
      startsAt: userRoleAssignments.startsAt,
      endsAt: userRoleAssignments.endsAt,
      userEmail: users.email,
    })
    .from(userRoleAssignments)
    .innerJoin(roles, eq(userRoleAssignments.roleId, roles.id))
    .innerJoin(users, eq(userRoleAssignments.userId, users.id))
    .orderBy(asc(users.email));
}

/**
 * Ensures app `users` row exists for the authenticated Auth user (idempotent).
 */
export async function ensureAppUserProfile(input: {
  id: string;
  email: string;
  displayName?: string | null;
}) {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
  if (existing) {
    if (existing.email !== input.email || (input.displayName && !existing.displayName)) {
      const [updated] = await db
        .update(users)
        .set({
          email: input.email,
          displayName: input.displayName ?? existing.displayName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      id: input.id,
      email: input.email,
      displayName: input.displayName ?? null,
      isActive: true,
    })
    .returning();
  return created;
}
