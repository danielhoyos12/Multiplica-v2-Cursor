import { DomainError, DomainErrorCode } from "@/lib/errors";

export type NetworkCode = "hombres" | "mujeres" | "jovenes" | "ninos";

export type AuthContext = {
  userId: string;
  personId: string | null;
  roleCodes: string[];
  permissionCodes: string[];
  ministryIds: string[];
  networkIds: string[];
};

export type ResourceRef = {
  type:
    | "ministry"
    | "network"
    | "user"
    | "person"
    | "cell"
    | "leader"
    | "audit"
    | "platform";
  id?: string;
  ministryId?: string;
  personId?: string;
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
  | "audit.read"
  | "cells.read"
  | "cells.create"
  | "cells.update"
  | "cells.manage_members"
  | "cells.attendance"
  | "leaders.read"
  | "leaders.mark_eligible"
  | "leaders.activate"
  | "leaders.deactivate"
  | "leaders.manage_tree"
  | "leaders.view_descendants"
  | "g12.convert_twelve";

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

export function canView(
  actor: AuthContext,
  target: ResourceRef | string,
  options?: { actorPersonId?: string | null; isDescendant?: boolean },
): boolean {
  if (isSuperadmin(actor)) {
    return true;
  }

  if (typeof target === "string") {
    if (options?.actorPersonId && options.actorPersonId === target) {
      return true;
    }
    return Boolean(options?.isDescendant);
  }

  switch (target.type) {
    case "platform":
      return hasPermission(actor, "platform.configure");
    case "ministry":
      if (!hasPermission(actor, "ministry.read") && !hasPermission(actor, "ministry.manage")) {
        return false;
      }
      if (!target.id) {
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
      if (options?.isDescendant && hasPermission(actor, "leaders.view_descendants")) {
        return true;
      }
      if (target.ministryId) {
        return canAccessMinistry(actor, target.ministryId);
      }
      return false;
    case "cell":
      if (!hasPermission(actor, "cells.read")) {
        return false;
      }
      if (target.ministryId) {
        return canAccessMinistry(actor, target.ministryId);
      }
      return false;
    case "leader":
      if (!hasPermission(actor, "leaders.read") && !hasPermission(actor, "leaders.view_descendants")) {
        return false;
      }
      if (target.personId && actor.personId && target.personId === actor.personId) {
        return true;
      }
      if (options?.isDescendant && hasPermission(actor, "leaders.view_descendants")) {
        return true;
      }
      // Leader General (or ministry-scoped LG) may view whole ministry tree.
      if (target.ministryId && isLeaderGeneral(actor) && canAccessMinistry(actor, target.ministryId)) {
        return true;
      }
      // Regular leaders: ministry id alone is NOT enough (sibling deny).
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
  options?: { actorPersonId?: string | null; isDescendant?: boolean },
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

export function canJoinCellNetwork(
  personNetwork: NetworkCode,
  cellNetwork: NetworkCode,
): boolean {
  if (cellNetwork === "ninos" || personNetwork === "ninos") {
    return false;
  }
  if (cellNetwork === "jovenes") {
    return personNetwork === "jovenes";
  }
  return personNetwork === cellNetwork;
}

export function managedNetworksFor(managerNetwork: NetworkCode): NetworkCode[] {
  return (["hombres", "mujeres", "jovenes", "ninos"] as const).filter((code) =>
    canManageNetwork(managerNetwork, code),
  );
}
