import { DomainError, DomainErrorCode } from "@/lib/errors";

export type NetworkCode = "hombres" | "mujeres" | "jovenes" | "ninos";

export type AuthContext = {
  userId: string;
  roleCodes: string[];
  permissionCodes: string[];
  ministryIds: string[];
  networkIds: string[];
};

export type ResourceRef = {
  type: "ministry" | "network" | "user" | "person" | "audit" | "platform";
  id?: string;
  ministryId?: string;
};

export type MutateAction =
  | "persons.read"
  | "persons.write"
  | "ministry.manage"
  | "ministry.read"
  | "network.read"
  | "users.read"
  | "users.assign_roles"
  | "platform.configure"
  | "audit.read";

export function isSuperadmin(actor: AuthContext): boolean {
  return actor.roleCodes.includes("superadmin");
}

export function isLeaderGeneral(actor: AuthContext): boolean {
  return actor.roleCodes.includes("leader_general");
}

export function hasPermission(actor: AuthContext, permission: string): boolean {
  if (isSuperadmin(actor)) {
    return true;
  }
  return actor.permissionCodes.includes(permission);
}

export function canAccessMinistry(actor: AuthContext, ministryId: string): boolean {
  if (isSuperadmin(actor)) {
    return true;
  }
  return actor.ministryIds.includes(ministryId);
}

/**
 * Central view policy. Tree descent arrives in later phases.
 */
export function canView(
  actor: AuthContext,
  target: ResourceRef | string,
  options?: { actorPersonId?: string | null },
): boolean {
  if (isSuperadmin(actor)) {
    return true;
  }

  // Back-compat: string argument treated as person id
  if (typeof target === "string") {
    if (options?.actorPersonId && options.actorPersonId === target) {
      return true;
    }
    return false;
  }

  switch (target.type) {
    case "platform":
      return hasPermission(actor, "platform.configure");
    case "ministry":
      if (!hasPermission(actor, "ministry.read") && !hasPermission(actor, "ministry.manage")) {
        return false;
      }
      if (!target.id) {
        // List endpoint: permission checked here; rows filtered by ministryIds in service.
        return (
          hasPermission(actor, "ministry.read") || hasPermission(actor, "ministry.manage")
        );
      }
      return canAccessMinistry(actor, target.id);
    case "network":
      return hasPermission(actor, "network.read");
    case "user":
      if (!hasPermission(actor, "users.read")) {
        return false;
      }
      if (target.id && target.id === actor.userId) {
        return true;
      }
      return isSuperadmin(actor);
    case "person":
      if (!hasPermission(actor, "persons.read")) {
        return false;
      }
      if (options?.actorPersonId && target.id && options.actorPersonId === target.id) {
        return true;
      }
      if (target.ministryId) {
        return canAccessMinistry(actor, target.ministryId);
      }
      return false;
    case "audit":
      return hasPermission(actor, "audit.read");
    default:
      return false;
  }
}

export function canMutate(
  actor: AuthContext,
  action: MutateAction,
  targetResource?: ResourceRef,
): boolean {
  if (!hasPermission(actor, action)) {
    return false;
  }

  if (!targetResource) {
    return true;
  }

  if (targetResource.type === "ministry" && targetResource.id) {
    if (action === "ministry.manage") {
      // Creating/editing ministries is global platform power (superadmin via permission).
      // leader_general must not mutate another ministry even if somehow granted manage.
      return canAccessMinistry(actor, targetResource.id) || isSuperadmin(actor);
    }
    if (action === "ministry.read") {
      return canAccessMinistry(actor, targetResource.id);
    }
  }

  if (targetResource.ministryId && !canAccessMinistry(actor, targetResource.ministryId)) {
    return false;
  }

  if (action === "users.assign_roles" && !isSuperadmin(actor)) {
    return false;
  }

  return true;
}

export function assertCanView(
  actor: AuthContext,
  target: ResourceRef | string,
  options?: { actorPersonId?: string | null },
): void {
  if (!canView(actor, target, options)) {
    throw new DomainError(DomainErrorCode.NOT_AUTHORIZED, "No autorizado para ver el recurso.", {
      target,
    });
  }
}

export function assertCanMutate(
  actor: AuthContext,
  action: MutateAction,
  targetResource?: ResourceRef,
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
 * Network compatibility (invariant 16).
 * Hombres → Hombres + Jóvenes
 * Mujeres → Mujeres + Jóvenes
 * Jóvenes → solo Jóvenes
 * Niños → reserved for a future phase (never manages others while inactive)
 */
export function canManageNetwork(
  managerNetwork: NetworkCode,
  targetNetwork: NetworkCode,
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

export function managedNetworksFor(managerNetwork: NetworkCode): NetworkCode[] {
  return (["hombres", "mujeres", "jovenes", "ninos"] as const).filter((code) =>
    canManageNetwork(managerNetwork, code),
  );
}
