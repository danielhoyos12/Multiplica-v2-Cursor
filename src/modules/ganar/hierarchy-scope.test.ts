import { describe, expect, it } from "vitest";

import { canView, type AuthContext } from "@/modules/authorization/policy";
import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";

function actor(partial?: Partial<AuthContext>): AuthContext {
  return {
    userId: "u1",
    personId: null,
    roleCodes: [],
    permissionCodes: [],
    ministryIds: [],
    networkIds: [],
    ...partial,
  };
}

const leaderPerms = ROLE_PERMISSION_MAP.leader ?? [];
const lgPerms = ROLE_PERMISSION_MAP.leader_general ?? [];

describe("Ganar hierarchical person scope", () => {
  const ministry = "min-a";

  it("tree leader: own person allowed", () => {
    const a = actor({
      personId: "leader-a",
      roleCodes: ["leader"],
      permissionCodes: leaderPerms,
      ministryIds: [ministry],
    });
    expect(
      canView(
        a,
        { type: "person", id: "leader-a", ministryId: ministry },
        { actorPersonId: "leader-a" },
      ),
    ).toBe(true);
  });

  it("tree leader: descendant allowed when isDescendant flag set", () => {
    const a = actor({
      personId: "leader-a",
      roleCodes: ["leader"],
      permissionCodes: leaderPerms,
      ministryIds: [ministry],
    });
    expect(
      canView(
        a,
        { type: "person", id: "disciple-1", ministryId: ministry },
        { actorPersonId: "leader-a", isDescendant: true },
      ),
    ).toBe(true);
  });

  it("tree leader: lateral sibling in same ministry denied", () => {
    const a = actor({
      personId: "leader-a",
      roleCodes: ["leader"],
      permissionCodes: leaderPerms,
      ministryIds: [ministry],
    });
    expect(
      canView(
        a,
        { type: "person", id: "leader-b-sibling", ministryId: ministry },
        { actorPersonId: "leader-a", isDescendant: false },
      ),
    ).toBe(false);
  });

  it("tree leader: ascendant denied", () => {
    const a = actor({
      personId: "leader-a",
      roleCodes: ["leader"],
      permissionCodes: leaderPerms,
      ministryIds: [ministry],
    });
    expect(
      canView(
        a,
        { type: "person", id: "root-superior", ministryId: ministry },
        { actorPersonId: "leader-a", isDescendant: false },
      ),
    ).toBe(false);
  });

  it("leader_general: ministry-wide still allowed", () => {
    const a = actor({
      personId: "lg-1",
      roleCodes: ["leader_general"],
      permissionCodes: lgPerms,
      ministryIds: [ministry],
    });
    expect(
      canView(a, { type: "person", id: "anyone", ministryId: ministry }),
    ).toBe(true);
  });

  it("two independent pastoral lines: line A cannot view line B", () => {
    const lineA = actor({
      personId: "root-a",
      roleCodes: ["leader"],
      permissionCodes: leaderPerms,
      ministryIds: [ministry],
    });
    const lineBPerson = "root-b-disciple";
    expect(
      canView(
        lineA,
        { type: "person", id: lineBPerson, ministryId: ministry },
        { actorPersonId: "root-a", isDescendant: false },
      ),
    ).toBe(false);
  });
});
