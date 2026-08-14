import { DomainError, DomainErrorCode } from "@/lib/errors";

/**
 * Foundation authorization helpers.
 * Hierarchical tree checks land in later phases; Phase 0 establishes
 * the central API shape and global/ministry/network scope scaffolding.
 */

export type AuthContext = {
  userId: string;
  roleCodes: string[];
  permissionCodes: string[];
  ministryIds: string[];
  networkIds: string[];
};

export type MutateAction =
  | "persons.read"
  | "persons.write"
  | "ministry.manage"
  | "platform.configure"
  | "audit.read";

export function isSuperadmin(actor: AuthContext): boolean {
  return actor.roleCodes.includes("superadmin");
}

export function hasPermission(actor: AuthContext, permission: string): boolean {
  if (isSuperadmin(actor)) {
    return true;
  }
  return actor.permissionCodes.includes(permission);
}

/**
 * Phase 0 stub: without leadership tree data, only self + superadmin can view.
 * Later phases must resolve descent via adjacency list + recursive CTE.
 */
export function canView(actor: AuthContext, targetPersonId: string, options?: {
  actorPersonId?: string | null;
}): boolean {
  if (isSuperadmin(actor)) {
    return true;
  }

  if (options?.actorPersonId && options.actorPersonId === targetPersonId) {
    return true;
  }

  // Tree / ministry scoped visibility is intentionally not granted by default.
  return false;
}

export function canMutate(
  actor: AuthContext,
  action: MutateAction,
  targetResource?: { type: string; id?: string },
): boolean {
  void targetResource;
  if (!hasPermission(actor, action)) {
    return false;
  }

  // Resource-level checks (tree, ownership) expand in later phases.
  return true;
}

export function assertCanMutate(
  actor: AuthContext,
  action: MutateAction,
  targetResource?: { type: string; id?: string },
): void {
  if (!canMutate(actor, action, targetResource)) {
    throw new DomainError(
      DomainErrorCode.NOT_AUTHORIZED,
      `No autorizado para la acción ${action}.`,
      { action, targetResource },
    );
  }
}

/**
 * Network compatibility (invariant 16) — foundation helper.
 * Hombres → Hombres + Jóvenes
 * Mujeres → Mujeres + Jóvenes
 * Jóvenes → solo Jóvenes
 * Niños → policy TBD (configurable / currently inactive)
 */
export function canManageNetwork(
  managerNetwork: "hombres" | "mujeres" | "jovenes" | "ninos",
  targetNetwork: "hombres" | "mujeres" | "jovenes" | "ninos",
): boolean {
  if (managerNetwork === "hombres") {
    return targetNetwork === "hombres" || targetNetwork === "jovenes";
  }
  if (managerNetwork === "mujeres") {
    return targetNetwork === "mujeres" || targetNetwork === "jovenes";
  }
  if (managerNetwork === "jovenes") {
    return targetNetwork === "jovenes";
  }
  return false;
}
