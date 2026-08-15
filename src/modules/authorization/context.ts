import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  permissions,
  rolePermissions,
  roles,
  userRoleAssignments,
  ministries,
  users,
} from "@/db/schema";

import type { AuthContext } from "./policy";

/**
 * Loads authorization context for a signed-in app user from DB.
 * Ministry scope = active role assignments with ministry_id OR ministries.responsible_user_id.
 */
export async function loadAuthContext(userId: string): Promise<AuthContext> {
  const db = getDb();

  const [profile] = await db
    .select({ personId: users.personId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const assignments = await db
    .select({
      roleCode: roles.code,
      ministryId: userRoleAssignments.ministryId,
      networkId: userRoleAssignments.networkId,
      roleId: roles.id,
    })
    .from(userRoleAssignments)
    .innerJoin(roles, eq(userRoleAssignments.roleId, roles.id))
    .where(
      and(eq(userRoleAssignments.userId, userId), isNull(userRoleAssignments.endsAt)),
    );

  const roleCodes = [...new Set(assignments.map((row) => row.roleCode))];
  const roleIds = [...new Set(assignments.map((row) => row.roleId))];

  let permissionCodes: string[] = [];
  if (roleIds.length > 0) {
    const permissionRows = await db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds));
    permissionCodes = [...new Set(permissionRows.map((row) => row.code))];
  }

  const ministryIds = new Set(
    assignments
      .map((row) => row.ministryId)
      .filter((id): id is string => Boolean(id)),
  );

  const responsible = await db
    .select({ id: ministries.id })
    .from(ministries)
    .where(eq(ministries.responsibleUserId, userId));

  for (const row of responsible) {
    ministryIds.add(row.id);
  }

  const networkIds = [
    ...new Set(
      assignments
        .map((row) => row.networkId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  return {
    userId,
    personId: profile?.personId ?? null,
    roleCodes,
    permissionCodes,
    ministryIds: [...ministryIds],
    networkIds,
  };
}
