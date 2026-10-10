import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { forbidden, unauthenticated } from "./errors";

type AuthCtx = QueryCtx | MutationCtx;

export type AppUser = Doc<"users">;

export type ConvexAuthContext = {
  userId: string;
  personId: string | null;
  roleCodes: string[];
  permissionCodes: string[];
  ministryIds: string[];
  networkIds: string[];
};

/**
 * Clerk JWT identity from `ctx.auth.getUserIdentity()`.
 * `identity.subject` is the Clerk `user_…` id stored as `users.authSubject`.
 */
export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return unauthenticated("Debes iniciar sesión para continuar.");
  }
  return identity;
}

export async function findUserByAuthSubject(ctx: AuthCtx, authSubject: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q) => q.eq("authSubject", authSubject))
    .unique();
}

export async function findUserByEmail(ctx: AuthCtx, email: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

/**
 * Resolves the MULTIPLICA app user from the Clerk token subject.
 * Does not create users. Unknown identities return null.
 */
export async function getAppUserOrNull(ctx: AuthCtx): Promise<AppUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await findUserByAuthSubject(ctx, identity.subject);
}

export async function requireAppUser(ctx: AuthCtx): Promise<AppUser> {
  const identity = await requireIdentity(ctx);
  const user = await findUserByAuthSubject(ctx, identity.subject);
  if (!user) {
    return forbidden("Tu cuenta no está habilitada en MULTIPLICA.");
  }
  return user;
}

export async function requireActiveAppUser(ctx: AuthCtx): Promise<AppUser> {
  const user = await requireAppUser(ctx);
  if (!user.isActive) {
    return forbidden("Tu cuenta está inactiva.");
  }
  return user;
}

export async function loadAuthzForUser(
  ctx: AuthCtx,
  userId: Id<"users">,
): Promise<ConvexAuthContext> {
  const user = await ctx.db.get("users", userId);

  const assignments = await ctx.db
    .query("userRoleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const activeAssignments = assignments.filter((a) => a.endsAt === undefined);

  const roleIds = [...new Set(activeAssignments.map((a) => a.roleId))];
  const roleDocs = await Promise.all(roleIds.map((roleId) => ctx.db.get("roles", roleId)));
  const roleCodes = [
    ...new Set(
      roleDocs
        .filter((role): role is NonNullable<typeof role> => role !== null)
        .map((role) => role.code),
    ),
  ];

  const permissionCodes = new Set<string>();
  for (const roleId of roleIds) {
    const rolePermissions = await ctx.db
      .query("rolePermissions")
      .withIndex("by_role", (q) => q.eq("roleId", roleId))
      .collect();
    for (const rp of rolePermissions) {
      const permission = await ctx.db.get("permissions", rp.permissionId);
      if (permission) permissionCodes.add(permission.code);
    }
  }

  const ministryIds = new Set<string>();
  for (const assignment of activeAssignments) {
    if (assignment.ministryId) ministryIds.add(assignment.ministryId);
  }
  const responsibleMinistries = await ctx.db
    .query("ministries")
    .withIndex("by_responsibleUserId", (q) => q.eq("responsibleUserId", userId))
    .collect();
  for (const ministry of responsibleMinistries) {
    ministryIds.add(ministry._id);
  }

  const networkIds = new Set<string>();
  for (const assignment of activeAssignments) {
    if (assignment.networkId) networkIds.add(assignment.networkId);
  }

  return {
    userId,
    personId: user?.personId ?? null,
    roleCodes,
    permissionCodes: [...permissionCodes],
    ministryIds: [...ministryIds],
    networkIds: [...networkIds],
  };
}

export function isSuperadmin(auth: ConvexAuthContext): boolean {
  return auth.roleCodes.includes("superadmin");
}

export function hasPermission(auth: ConvexAuthContext, permission: string): boolean {
  if (isSuperadmin(auth)) return true;
  return auth.permissionCodes.includes(permission);
}

export async function requireAuthz(ctx: AuthCtx): Promise<{
  actor: AppUser;
  auth: ConvexAuthContext;
}> {
  const actor = await requireActiveAppUser(ctx);
  const auth = await loadAuthzForUser(ctx, actor._id);
  return { actor, auth };
}

export async function requirePermission(ctx: AuthCtx, permission: string) {
  const { actor, auth } = await requireAuthz(ctx);
  if (!hasPermission(auth, permission)) {
    return forbidden("No tienes permiso para esta operación.");
  }
  return { actor, auth };
}

export async function requireAnyPermission(ctx: AuthCtx, permissions: string[]) {
  const { actor, auth } = await requireAuthz(ctx);
  if (!permissions.some((permission) => hasPermission(auth, permission))) {
    return forbidden("No tienes permiso para esta operación.");
  }
  return { actor, auth };
}

export async function requireSuperadmin(ctx: AuthCtx) {
  const { actor, auth } = await requireAuthz(ctx);
  if (!isSuperadmin(auth)) {
    return forbidden("Solo superadmin puede realizar esta operación.");
  }
  return { actor, auth };
}

export async function requireMinistryScope(ctx: AuthCtx, ministryId: Id<"ministries">) {
  const { actor, auth } = await requireAuthz(ctx);
  if (!isSuperadmin(auth) && !auth.ministryIds.includes(ministryId)) {
    return forbidden("No tienes alcance sobre este Ministerio.");
  }
  return { actor, auth };
}

export async function requireNetworkScope(ctx: AuthCtx, networkId: Id<"networks">) {
  const { actor, auth } = await requireAuthz(ctx);
  if (!isSuperadmin(auth) && auth.networkIds.length > 0 && !auth.networkIds.includes(networkId)) {
    return forbidden("No tienes alcance sobre esta Red.");
  }
  return { actor, auth };
}

/**
 * Target user IDs are resources, never the actor. Callers must not pass
 * `actorUserId` from the client to decide who is operating.
 */
export async function requireSelfOrPermission(
  ctx: AuthCtx,
  targetUserId: Id<"users">,
  permission: string,
) {
  const { actor, auth } = await requireAuthz(ctx);
  if (actor._id === targetUserId) return { actor, auth };
  if (!hasPermission(auth, permission)) {
    return forbidden("No tienes permiso para ver este usuario.");
  }
  return { actor, auth };
}
