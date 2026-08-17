import { z } from "zod";

import type { Id } from "../../../convex/_generated/dataModel";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { mapConvexError } from "@/lib/convex-errors";
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
import { api, getConvexHttpClient } from "@/server/convex";

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

type MinistryDoc = {
  _id: Id<"ministries">;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  responsibleUserId?: Id<"users">;
  createdAt: number;
  updatedAt: number;
};

type UserDoc = {
  _id: Id<"users">;
  email: string;
  displayName?: string;
  authSubject: string;
  isActive: boolean;
  mustChangePassword: boolean;
  personId?: Id<"persons">;
  createdAt: number;
  updatedAt: number;
};

async function requireActor(userId: string): Promise<AuthContext> {
  return loadAuthContext(userId);
}

function toMinistryDetail(ministry: MinistryDoc) {
  return {
    id: ministry._id as string,
    code: ministry.code,
    name: ministry.name,
    sortOrder: ministry.sortOrder,
    isActive: ministry.isActive,
    responsibleUserId: (ministry.responsibleUserId as string | undefined) ?? null,
    createdAt: new Date(ministry.createdAt),
    updatedAt: new Date(ministry.updatedAt),
  };
}

function toMinistryRow(
  ministry: MinistryDoc,
  usersById: Map<string, UserDoc>,
) {
  const responsible = ministry.responsibleUserId
    ? usersById.get(ministry.responsibleUserId as string)
    : undefined;

  return {
    ...toMinistryDetail(ministry),
    responsibleEmail: responsible?.email ?? null,
    responsibleDisplayName: responsible?.displayName ?? null,
  };
}

function toAppUser(user: UserDoc) {
  return {
    id: user._id as string,
    email: user.email,
    displayName: user.displayName ?? null,
    /** Clerk `user_…` id / Convex identity subject. */
    clerkUserId: user.authSubject,
    authSubject: user.authSubject,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    personId: (user.personId as string | undefined) ?? null,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

export async function listMinistriesForActor(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  assertCanView(actor, { type: "ministry" });

  const client = getConvexHttpClient();
  const [ministries, users] = await Promise.all([
    client.query(api.organization.listMinistries, {}),
    client.query(api.organization.listUsers, {}),
  ]);

  const usersById = new Map(users.map((user) => [user._id as string, user]));
  const rows = ministries.map((ministry) => toMinistryRow(ministry, usersById));

  if (isSuperadmin(actor)) {
    return rows;
  }

  return rows.filter((row) => canAccessMinistry(actor, row.id));
}

export async function getMinistryForActor(actorUserId: string, ministryId: string) {
  const actor = await requireActor(actorUserId);
  assertCanView(actor, { type: "ministry", id: ministryId });

  const client = getConvexHttpClient();
  const ministry = await client.query(api.organization.getMinistry, {
    ministryId: ministryId as Id<"ministries">,
  });

  if (!ministry) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no encontrado.");
  }
  return toMinistryDetail(ministry);
}

export async function createMinistry(actorUserId: string, input: MinistryInput) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministry.manage", { type: "ministry" });

  const parsed = ministryInputSchema.parse(input);
  if (!isValidHumanCode(parsed.code)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Código humano inválido.");
  }

  const client = getConvexHttpClient();
  const created = await client
    .mutation(api.organization.createMinistry, {
      code: parsed.code,
      name: parsed.name,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    })
    .catch(mapConvexError);

  const after = toMinistryDetail(created);

  await writeAuditLog({
    actorUserId,
    action: "ministry.create",
    entityType: "ministry",
    entityId: after.id,
    afterData: after,
  });

  return after;
}

export async function updateMinistry(
  actorUserId: string,
  ministryId: string,
  input: Partial<MinistryInput>,
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministry.manage", { type: "ministry", id: ministryId });

  const client = getConvexHttpClient();
  const before = await client.query(api.organization.getMinistry, {
    ministryId: ministryId as Id<"ministries">,
  });
  if (!before) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no encontrado.");
  }

  const parsed = ministryInputSchema.partial().parse(input);

  const after = await client
    .mutation(api.organization.updateMinistry, {
      ministryId: ministryId as Id<"ministries">,
      code: parsed.code,
      name: parsed.name,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    })
    .catch(mapConvexError);

  const beforeDetail = toMinistryDetail(before);
  const afterDetail = toMinistryDetail(after);

  await writeAuditLog({
    actorUserId,
    action: "ministry.update",
    entityType: "ministry",
    entityId: ministryId,
    beforeData: beforeDetail,
    afterData: afterDetail,
  });

  return afterDetail;
}

export async function setMinistryActive(
  actorUserId: string,
  ministryId: string,
  isActive: boolean,
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "ministry.manage", { type: "ministry", id: ministryId });

  const client = getConvexHttpClient();
  const before = await client.query(api.organization.getMinistry, {
    ministryId: ministryId as Id<"ministries">,
  });
  if (!before) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no encontrado.");
  }

  const after = await client
    .mutation(api.organization.setMinistryActive, {
      ministryId: ministryId as Id<"ministries">,
      isActive,
    })
    .catch(mapConvexError);

  const beforeDetail = toMinistryDetail(before);
  const afterDetail = toMinistryDetail(after);

  await writeAuditLog({
    actorUserId,
    action: isActive ? "ministry.activate" : "ministry.deactivate",
    entityType: "ministry",
    entityId: ministryId,
    beforeData: beforeDetail,
    afterData: afterDetail,
  });

  return afterDetail;
}

/**
 * Assigns Líder General: sets `ministries.responsibleUserId` and ensures an
 * active `userRoleAssignments` row with role `leader_general` + ministry
 * scope (see `convex/organization.ts` `assignMinistryResponsible`).
 */
export async function assignMinistryResponsible(
  actorUserId: string,
  ministryId: string,
  responsibleUserId: string | null,
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "users.assign_roles", { type: "ministry", id: ministryId });

  const client = getConvexHttpClient();
  const before = await client.query(api.organization.getMinistry, {
    ministryId: ministryId as Id<"ministries">,
  });
  if (!before) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, "Ministerio no encontrado.");
  }

  const after = await client
    .mutation(api.organization.assignMinistryResponsible, {
      ministryId: ministryId as Id<"ministries">,
      responsibleUserId: responsibleUserId
        ? (responsibleUserId as Id<"users">)
        : null,
      createdByUserId: actorUserId as Id<"users">,
    })
    .catch(mapConvexError);

  const beforeDetail = toMinistryDetail(before);
  const afterDetail = toMinistryDetail(after);

  await writeAuditLog({
    actorUserId,
    action: "ministry.assign_leader_general",
    entityType: "ministry",
    entityId: ministryId,
    beforeData: beforeDetail,
    afterData: afterDetail,
    reason: responsibleUserId
      ? "Asignación de Líder General"
      : "Remoción de Líder General",
  });

  return afterDetail;
}

export async function listNetworksForActor(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  assertCanView(actor, { type: "network" });

  const client = getConvexHttpClient();
  const rows = await client.query(api.organization.listNetworks, {});

  return rows.map((row) => ({
    id: row._id as string,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    isConfigurable: row.isConfigurable,
    sortOrder: row.sortOrder,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

export async function listUsersForAdmin(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "users.read", { type: "user" });

  const client = getConvexHttpClient();
  const rows = await client.query(api.organization.listUsers, {});

  return rows.map((row) => ({
    id: row._id as string,
    email: row.email,
    displayName: row.displayName ?? null,
    isActive: row.isActive,
    personId: (row.personId as string | undefined) ?? null,
    createdAt: new Date(row.createdAt),
  }));
}

export async function listUserRoleAssignments(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "users.read", { type: "user" });

  const client = getConvexHttpClient();
  const rows = await client.query(api.organization.listUserRoleAssignments, {});

  return rows.map((row) => ({
    id: row._id as string,
    userId: row.userId as string,
    roleCode: row.roleCode,
    ministryId: (row.ministryId as string | undefined) ?? null,
    networkId: (row.networkId as string | undefined) ?? null,
    startsAt: new Date(row.startsAt),
    endsAt: row.endsAt ? new Date(row.endsAt) : null,
    userEmail: row.userEmail,
  }));
}

/**
 * Ensures the Convex `users` profile exists for the authenticated identity
 * (idempotent — see `convex/users.ts` `ensureProfile`).
 */
export async function ensureAppUserProfile(input: {
  clerkUserId: string;
  email: string;
  displayName?: string | null;
}) {
  const client = getConvexHttpClient();
  const profile = await client
    .mutation(api.users.ensureProfile, {
      authSubject: input.clerkUserId,
      email: input.email,
      displayName: input.displayName ?? undefined,
    })
    .catch(mapConvexError);

  return toAppUser(profile);
}
