import { describe, expect, it } from "vitest";

import {
  canAccessMinistry,
  canManageNetwork,
  canMutate,
  canView,
  hasPermission,
  isSuperadmin,
  managedNetworksFor,
  type AuthContext,
} from "@/modules/authorization/policy";
import {
  buildChildHumanCode,
  buildRootHumanCode,
  formatHumanCode,
  parseHumanCode,
} from "@/lib/human-codes";
import { NETWORK_SEEDS } from "@/db/seeds/data";
import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";

function actor(partial?: Partial<AuthContext>): AuthContext {
  return {
    userId: "user-1",
    roleCodes: [],
    permissionCodes: [],
    ministryIds: [],
    networkIds: [],
    ...partial,
  };
}

describe("phase 1 authorization", () => {
  it("grants superadmin global access", () => {
    const admin = actor({ roleCodes: ["superadmin"] });
    expect(isSuperadmin(admin)).toBe(true);
    expect(canView(admin, { type: "ministry", id: "m-other" })).toBe(true);
    expect(canMutate(admin, "ministry.manage", { type: "ministry" })).toBe(true);
  });

  it("isolates leader_general to assigned ministries", () => {
    const leader = actor({
      roleCodes: ["leader_general"],
      permissionCodes: ROLE_PERMISSION_MAP.leader_general,
      ministryIds: ["ministry-a"],
    });

    expect(canAccessMinistry(leader, "ministry-a")).toBe(true);
    expect(canAccessMinistry(leader, "ministry-b")).toBe(false);
    expect(canView(leader, { type: "ministry", id: "ministry-a" })).toBe(true);
    expect(canView(leader, { type: "ministry", id: "ministry-b" })).toBe(false);
    expect(hasPermission(leader, "ministry.manage")).toBe(false);
    expect(canMutate(leader, "ministry.manage", { type: "ministry", id: "ministry-a" })).toBe(
      false,
    );
  });

  it("keeps network compatibility rules", () => {
    expect(managedNetworksFor("hombres")).toEqual(["hombres", "jovenes"]);
    expect(managedNetworksFor("mujeres")).toEqual(["mujeres", "jovenes"]);
    expect(managedNetworksFor("jovenes")).toEqual(["jovenes"]);
    expect(managedNetworksFor("ninos")).toEqual([]);
    expect(canManageNetwork("ninos", "ninos")).toBe(false);
  });

  it("keeps Niños inactive in seeds", () => {
    const ninos = NETWORK_SEEDS.find((n) => n.code === "ninos");
    expect(ninos?.isActive).toBe(false);
    expect(ninos?.isConfigurable).toBe(true);
  });
});

describe("human codes service", () => {
  it("formats root and child codes", () => {
    expect(buildRootHumanCode("LP", 1)).toBe("LP1");
    expect(buildChildHumanCode("LP1", 3)).toBe("LP1-03");
    expect(buildChildHumanCode("LP1-03", 1)).toBe("LP1-03-01");
    expect(parseHumanCode("LP1-03-01")).toEqual(["LP1", "03", "01"]);
    expect(formatHumanCode(["LP1", "03", "01"])).toBe("LP1-03-01");
  });
});
