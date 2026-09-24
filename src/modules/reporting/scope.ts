/**
 * Phase 9 — Dashboard scope resolution.
 * Single engine for Leader / LG / Superadmin. Never leak cross-scope.
 */
import { DomainError, DomainErrorCode } from "@/lib/errors";
import {
  hasPermission,
  isLeaderGeneral,
  isSuperadmin,
  loadAuthContext,
  type AuthContext,
} from "@/modules/authorization";
import { assertTreeAccess, isDescendantOf } from "@/modules/leadership/service";

export type DashboardScopeMode = "global" | "ministry" | "subtree";

export type DashboardScope = {
  actor: AuthContext;
  mode: DashboardScopeMode;
  /** When mode=ministry or filtered */
  ministryIds: string[];
  networkId: string | null;
  /** Focus root for subtree metrics (self or authorized descendant) */
  rootPersonId: string | null;
  roleView: "superadmin" | "leader_general" | "leader" | "staff";
};

export type ScopeFilters = {
  ministryId?: string | null;
  networkId?: string | null;
  rootPersonId?: string | null;
};

export async function resolveDashboardScope(
  actorUserId: string,
  filters: ScopeFilters = {},
): Promise<DashboardScope> {
  const actor = await loadAuthContext(actorUserId);

  if (
    !hasPermission(actor, "dashboard.read") &&
    !hasPermission(actor, "persons.read") &&
    !hasPermission(actor, "process.read") &&
    !hasPermission(actor, "leaders.read")
  ) {
    throw new DomainError(DomainErrorCode.DASHBOARD_ACCESS_DENIED, "Sin permiso de dashboard.");
  }

  let roleView: DashboardScope["roleView"] = "staff";
  if (isSuperadmin(actor)) roleView = "superadmin";
  else if (isLeaderGeneral(actor)) roleView = "leader_general";
  else if (actor.personId && actor.roleCodes.includes("leader")) roleView = "leader";

  let mode: DashboardScopeMode = "subtree";
  let ministryIds: string[] = [];
  let rootPersonId: string | null = null;

  if (isSuperadmin(actor)) {
    mode = filters.ministryId ? "ministry" : "global";
    ministryIds = filters.ministryId ? [filters.ministryId] : [];
    if (filters.rootPersonId) {
      await assertTreeAccess(actor, filters.rootPersonId);
      rootPersonId = filters.rootPersonId;
      mode = "subtree";
    }
  } else if (isLeaderGeneral(actor)) {
    ministryIds = actor.ministryIds;
    if (filters.ministryId) {
      if (!actor.ministryIds.includes(filters.ministryId)) {
        throw new DomainError(
          DomainErrorCode.DASHBOARD_ACCESS_DENIED,
          "Ministerio fuera de scope.",
        );
      }
      ministryIds = [filters.ministryId];
    }
    if (ministryIds.length === 0) {
      throw new DomainError(DomainErrorCode.DASHBOARD_ACCESS_DENIED, "Sin Ministerio en scope.");
    }
    mode = "ministry";
    if (filters.rootPersonId) {
      await assertTreeAccess(actor, filters.rootPersonId, ministryIds[0]);
      rootPersonId = filters.rootPersonId;
      mode = "subtree";
    }
  } else {
    // Leader / staff with person link — subtree only
    const self = actor.personId;
    if (!self) {
      // staff without person: ministry-limited if any
      if (actor.ministryIds.length) {
        mode = "ministry";
        ministryIds = filters.ministryId
          ? actor.ministryIds.includes(filters.ministryId)
            ? [filters.ministryId]
            : (() => {
                throw new DomainError(
                  DomainErrorCode.DASHBOARD_ACCESS_DENIED,
                  "Ministerio fuera de scope.",
                );
              })()
          : actor.ministryIds;
      } else {
        throw new DomainError(
          DomainErrorCode.DASHBOARD_ACCESS_DENIED,
          "Sin scope pastoral para dashboard.",
        );
      }
    } else {
      rootPersonId = self;
      if (filters.rootPersonId && filters.rootPersonId !== self) {
        const ok = await isDescendantOf(self, filters.rootPersonId);
        if (!ok && !isSuperadmin(actor)) {
          throw new DomainError(
            DomainErrorCode.TREE_ACCESS_DENIED,
            "Nodo fuera de su subárbol.",
          );
        }
        rootPersonId = filters.rootPersonId;
      }
      mode = "subtree";
      ministryIds = actor.ministryIds;
    }
  }

  // LG cannot escalate to global
  if (!isSuperadmin(actor) && mode === "global") {
    mode = "ministry";
  }

  return {
    actor,
    mode,
    ministryIds,
    networkId: filters.networkId ?? null,
    rootPersonId,
    roleView,
  };
}
