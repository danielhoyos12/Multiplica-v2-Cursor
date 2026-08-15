import { describe, expect, it } from "vitest";

import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { DomainErrorCode } from "@/lib/errors";
import {
  canMutate,
  canView,
  type AuthContext,
} from "@/modules/authorization/policy";
import { LeadershipRules } from "@/modules/leadership/service";
import {
  buildUsernameBase,
  nextUsernameCandidate,
  slugifyNamePart,
} from "@/modules/leadership/username";
import { generateTemporaryPassword } from "@/modules/leadership/credentials";
import {
  activateLeaderInputSchema,
  convertTwelveInputSchema,
  markEligibleInputSchema,
} from "@/modules/leadership/validation";

function actor(partial?: Partial<AuthContext>): AuthContext {
  return {
    userId: "user-1",
    personId: null,
    roleCodes: [],
    permissionCodes: [],
    ministryIds: [],
    networkIds: [],
    ...partial,
  };
}

describe("LeadershipRules G12 counting", () => {
  it("1. eligible does not count as leader for the 12", () => {
    expect(
      LeadershipRules.countsAsLeaderForTwelve({
        status: "eligible",
        hasActiveOwnCell: true,
      }),
    ).toBe(false);
  });

  it("2. active without own cell does not count", () => {
    expect(
      LeadershipRules.countsAsLeaderForTwelve({
        status: "active",
        hasActiveOwnCell: false,
      }),
    ).toBe(false);
  });

  it("18. active with own cell counts", () => {
    expect(
      LeadershipRules.countsAsLeaderForTwelve({
        status: "active",
        hasActiveOwnCell: true,
      }),
    ).toBe(true);
  });

  it("14–15. progress 11/12 and ready at 12", () => {
    expect(LeadershipRules.twelveReady(11)).toBe(false);
    expect(LeadershipRules.twelveReady(12)).toBe(true);
    expect(LeadershipRules.canAddThirteenthDirect(11)).toBe(true);
    expect(LeadershipRules.canAddThirteenthDirect(12)).toBe(false);
  });

  it("19. thirteenth direct leader blocked", () => {
    expect(LeadershipRules.canAddThirteenthDirect(12)).toBe(false);
    expect(LeadershipRules.MAX_DIRECT_LEADERS).toBe(12);
  });
});

describe("leadership authorization scopes", () => {
  const leaderA = actor({
    userId: "ua",
    personId: "person-a",
    roleCodes: ["leader"],
    permissionCodes: ROLE_PERMISSION_MAP.leader,
    ministryIds: ["ministry-a"],
  });
  const leaderB = actor({
    userId: "ub",
    personId: "person-b",
    roleCodes: ["leader"],
    permissionCodes: ROLE_PERMISSION_MAP.leader,
    ministryIds: ["ministry-a"],
  });
  const lg = actor({
    userId: "ulg",
    personId: "person-root",
    roleCodes: ["leader_general"],
    permissionCodes: ROLE_PERMISSION_MAP.leader_general,
    ministryIds: ["ministry-a"],
  });
  const otherMinistry = actor({
    userId: "uo",
    personId: "person-other",
    roleCodes: ["leader_general"],
    permissionCodes: ROLE_PERMISSION_MAP.leader_general,
    ministryIds: ["ministry-b"],
  });
  const admin = actor({ roleCodes: ["superadmin"] });

  it("30–31. sibling deny / descendant allow for canView leader", () => {
    expect(
      canView(
        leaderA,
        { type: "leader", personId: "person-a1", ministryId: "ministry-a" },
        { isDescendant: true },
      ),
    ).toBe(true);
    expect(
      canView(leaderA, {
        type: "leader",
        personId: "person-b",
        ministryId: "ministry-a",
      }),
    ).toBe(false);
    expect(
      canView(leaderB, {
        type: "leader",
        personId: "person-a",
        ministryId: "ministry-a",
      }),
    ).toBe(false);
  });

  it("32–34. leader_general ministry allow, cross-ministry deny, superadmin allow", () => {
    expect(
      canView(lg, { type: "leader", personId: "anyone", ministryId: "ministry-a" }),
    ).toBe(true);
    expect(
      canView(otherMinistry, {
        type: "leader",
        personId: "anyone",
        ministryId: "ministry-a",
      }),
    ).toBe(false);
    expect(
      canView(admin, { type: "leader", personId: "x", ministryId: "ministry-a" }),
    ).toBe(true);
  });

  it("activation mutate permissions present for leader and LG", () => {
    expect(
      canMutate(leaderA, "leaders.activate", {
        type: "leader",
        ministryId: "ministry-a",
      }),
    ).toBe(true);
    expect(
      canMutate(lg, "leaders.activate", {
        type: "leader",
        ministryId: "ministry-a",
      }),
    ).toBe(true);
    expect(
      canMutate(otherMinistry, "leaders.activate", {
        type: "leader",
        ministryId: "ministry-a",
      }),
    ).toBe(false);
  });
});

describe("username + credentials", () => {
  it("11. username base is stable and collision candidates increment", () => {
    expect(slugifyNamePart("Juan")).toBe("juan");
    expect(buildUsernameBase("Juan", "Pérez García")).toBe("juan.perez");
    expect(nextUsernameCandidate("juan.perez", 1)).toBe("juan.perez");
    expect(nextUsernameCandidate("juan.perez", 2)).toBe("juan.perez2");
  });

  it("12. temporary password is opaque and never empty", () => {
    const pwd = generateTemporaryPassword();
    expect(pwd.length).toBeGreaterThan(12);
    expect(pwd).not.toContain(" ");
  });
});

describe("leadership validation schemas", () => {
  it("parses mark eligible + activate + convert payloads", () => {
    const eligible = markEligibleInputSchema.parse({
      personId: "11111111-1111-4111-8111-111111111111",
      ministryId: "22222222-2222-4222-8222-222222222222",
      networkId: "33333333-3333-4333-8333-333333333333",
    });
    expect(eligible.personId).toBeTruthy();

    const activate = activateLeaderInputSchema.parse({
      personId: "11111111-1111-4111-8111-111111111111",
      directLeaderPersonId: "44444444-4444-4444-8444-444444444444",
      cell: {
        name: "Célula Nueva",
        dayOfWeek: "wednesday",
        startTime: "19:30",
      },
    });
    expect(activate.cell.startTime).toBe("19:30:00");

    const convert = convertTwelveInputSchema.parse({
      cellId: "55555555-5555-4555-8555-555555555555",
      ordinaryMemberPersonIds: [],
    });
    expect(convert.ordinaryMemberPersonIds).toEqual([]);
  });
});

describe("domain error codes phase 4", () => {
  it("exposes required pastoral error codes", () => {
    const required = [
      "LEADER_NOT_ELIGIBLE",
      "LEADER_ALREADY_ACTIVE",
      "LEADER_REQUIRES_CELL",
      "LEADER_INVALID_ACTIVATOR",
      "LEADER_DIFFERENT_MINISTRY",
      "LEADER_HAS_ACTIVE_STRUCTURE",
      "DIRECT_LEADER_REQUIRED",
      "DIRECT_LEADER_INVALID",
      "DIRECT_LEADER_CYCLE",
      "DIRECT_LEADER_CAPACITY_REACHED",
      "MAX_DIRECT_CELLS_REACHED",
      "TWELVE_NOT_READY",
      "TWELVE_REQUIRES_12_ACTIVE_LEADERS",
      "TWELVE_MEMBER_NOT_ACTIVE_LEADER",
      "TWELVE_HAS_ORDINARY_MEMBERS",
      "TREE_ACCESS_DENIED",
      "USERNAME_COLLISION",
      "CREDENTIAL_PROVISION_FAILED",
    ] as const;
    for (const code of required) {
      expect(DomainErrorCode[code]).toBe(code);
    }
  });
});
