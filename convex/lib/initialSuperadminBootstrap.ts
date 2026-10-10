import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ROLE_PERMISSION_MAP } from "../../src/db/seeds/data";
import { conflict, forbidden, invalidArgument, notFound } from "./errors";
import { now } from "./time";

export const INITIAL_SUPERADMIN_BOOTSTRAP_ENV = "ALLOW_INITIAL_SUPERADMIN_BOOTSTRAP";
export const INITIAL_SUPERADMIN_DEPLOYMENT_URL = "https://brainy-fennec-556.convex.cloud";
export const INITIAL_SUPERADMIN_AUDIT_ACTION = "auth.initial_superadmin_bootstrapped";

export type InitialSuperadminBootstrapInput = {
  clerkUserId: string;
  email: string;
  displayName?: string;
};

export type InitialSuperadminBootstrapResult = {
  userId: Id<"users">;
  assignmentId: Id<"userRoleAssignments">;
  created: boolean;
};

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export function assertInitialSuperadminBootstrapAllowed(
  environment: RuntimeEnvironment = process.env,
): void {
  if (environment[INITIAL_SUPERADMIN_BOOTSTRAP_ENV] !== "true") {
    forbidden(`${INITIAL_SUPERADMIN_BOOTSTRAP_ENV} must be exactly 'true'.`);
  }

  if (environment.CONVEX_CLOUD_URL !== INITIAL_SUPERADMIN_DEPLOYMENT_URL) {
    forbidden(
      "Initial superadmin bootstrap is restricted to the authorized Development deployment.",
    );
  }
}

function normalizeInput(
  input: InitialSuperadminBootstrapInput,
): InitialSuperadminBootstrapInput {
  const clerkUserId = input.clerkUserId.trim();
  if (
    clerkUserId !== input.clerkUserId ||
    !/^user_[A-Za-z0-9]+$/.test(clerkUserId) ||
    clerkUserId.length > 128
  ) {
    invalidArgument("Clerk User ID is invalid.");
  }

  const email = input.email.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    invalidArgument("Primary email is invalid.");
  }

  const displayName = input.displayName?.trim();
  if (displayName !== undefined && (displayName.length < 2 || displayName.length > 120)) {
    invalidArgument("Display name must contain between 2 and 120 characters.");
  }

  return {
    clerkUserId,
    email,
    displayName,
  };
}

async function requireSeededSuperadminRole(ctx: MutationCtx) {
  const role = await ctx.db
    .query("roles")
    .withIndex("by_code", (q) => q.eq("code", "superadmin"))
    .unique();

  if (!role) {
    return notFound("Global superadmin role is not seeded.");
  }
  if (role.scopeType !== "global" || !role.isSystem) {
    return conflict("Seeded superadmin role is not a global system role.");
  }

  const expectedPermissionCodes = new Set(ROLE_PERMISSION_MAP.superadmin ?? []);
  const links = await ctx.db
    .query("rolePermissions")
    .withIndex("by_role", (q) => q.eq("roleId", role._id))
    .collect();
  const permissions = await Promise.all(
    links.map((link) => ctx.db.get("permissions", link.permissionId)),
  );
  const actualPermissionCodes = permissions.map((permission) => permission?.code);

  if (
    expectedPermissionCodes.size === 0 ||
    links.length !== expectedPermissionCodes.size ||
    actualPermissionCodes.some(
      (code) => code === undefined || !expectedPermissionCodes.has(code),
    ) ||
    new Set(actualPermissionCodes).size !== expectedPermissionCodes.size
  ) {
    return conflict("Superadmin permission catalog is incomplete or inconsistent.");
  }

  return role;
}

/**
 * Atomically creates the first app user and global superadmin assignment.
 *
 * This function cannot call Clerk. Before invoking it, an operator must verify
 * in the Clerk Development dashboard that `clerkUserId` owns the supplied
 * verified primary email. The runtime validates formats and database
 * consistency, but does not claim to verify the email with Clerk.
 */
export async function bootstrapInitialSuperadmin(
  ctx: MutationCtx,
  rawInput: InitialSuperadminBootstrapInput,
): Promise<InitialSuperadminBootstrapResult> {
  assertInitialSuperadminBootstrapAllowed();
  const input = normalizeInput(rawInput);
  const role = await requireSeededSuperadminRole(ctx);

  const [users, assignments, bootstrapAudits] = await Promise.all([
    ctx.db.query("users").take(2),
    ctx.db.query("userRoleAssignments").take(2),
    ctx.db
      .query("auditLogs")
      .withIndex("by_action", (q) => q.eq("action", INITIAL_SUPERADMIN_AUDIT_ACTION))
      .collect(),
  ]);

  if (users.length === 0 && assignments.length === 0) {
    if (bootstrapAudits.length !== 0) {
      return conflict("Bootstrap audit exists without a user and assignment.");
    }

    const timestamp = now();
    const userId = await ctx.db.insert("users", {
      authSubject: input.clerkUserId,
      email: input.email,
      displayName: input.displayName,
      isActive: true,
      mustChangePassword: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const assignmentId = await ctx.db.insert("userRoleAssignments", {
      userId,
      roleId: role._id,
      startsAt: timestamp,
      createdAt: timestamp,
    });
    await ctx.db.insert("auditLogs", {
      action: INITIAL_SUPERADMIN_AUDIT_ACTION,
      entityType: "user",
      entityId: userId,
      afterData: {
        isActive: true,
        mustChangePassword: false,
        roleCode: "superadmin",
        scopeType: "global",
      },
      metadata: {
        source: "internal_bootstrap",
        deploymentUrl: INITIAL_SUPERADMIN_DEPLOYMENT_URL,
      },
      createdAt: timestamp,
    });

    return { userId, assignmentId, created: true };
  }

  if (users.length !== 1 || assignments.length !== 1) {
    return conflict(
      "Initial bootstrap requires either an empty database or one consistent bootstrap user and assignment.",
    );
  }

  const [user] = users;
  const [assignment] = assignments;
  if (
    user.authSubject !== input.clerkUserId ||
    user.email.trim().toLowerCase() !== input.email ||
    !user.isActive ||
    assignment.userId !== user._id ||
    assignment.roleId !== role._id ||
    assignment.ministryId !== undefined ||
    assignment.networkId !== undefined ||
    assignment.endsAt !== undefined
  ) {
    return conflict(
      "Existing user or role assignment is incompatible with initial bootstrap.",
    );
  }

  const matchingAudits = bootstrapAudits.filter(
    (audit) => audit.entityType === "user" && audit.entityId === user._id,
  );
  if (bootstrapAudits.length !== 1 || matchingAudits.length !== 1) {
    return conflict("Initial bootstrap audit state is inconsistent.");
  }

  return {
    userId: user._id,
    assignmentId: assignment._id,
    created: false,
  };
}
