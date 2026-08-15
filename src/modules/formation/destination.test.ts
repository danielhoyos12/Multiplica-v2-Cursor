import { describe, expect, it } from "vitest";

import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { DomainErrorCode } from "@/lib/errors";
import {
  canMutate,
  canView,
  type AuthContext,
} from "@/modules/authorization/policy";
import { DestinationRules } from "@/modules/formation/destination";
import {
  completeDestinoLevelInputSchema,
  createDestinoCycleInputSchema,
  enrollDestinoInputSchema,
} from "@/modules/formation/validation";

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

describe("DestinationRules", () => {
  it("1. Consolidar completed → CD1 eligible (UDV is NOT the gate)", () => {
    expect(DestinationRules.canEnterLevel1("completed")).toBe(true);
    expect(DestinationRules.udvIsNotGateBeforeCd1).toBe(true);
  });

  it("2. Consolidar incomplete → CD1 deny", () => {
    expect(DestinationRules.canEnterLevel1("in_progress")).toBe(false);
    expect(DestinationRules.canEnterLevel1(null)).toBe(false);
  });

  it("3–6. sequential level gates", () => {
    expect(DestinationRules.canEnterLevel(true)).toBe(true);
    expect(DestinationRules.canEnterLevel(false)).toBe(false);
  });

  it("CD3 requires CD2 + Re-Encuentro", () => {
    expect(DestinationRules.canEnterLevel3(true, true)).toBe(true);
    expect(DestinationRules.canEnterLevel3(true, false)).toBe(false);
  });

  it("8. elegibility does not enroll", () => {
    expect(DestinationRules.eligibilityDoesNotEnroll).toBe(true);
  });

  it("11–12 / 16. 12 persons metric (not G12 leaders)", () => {
    expect(DestinationRules.personsNotLeaders(11, 12)).toBe(false);
    expect(DestinationRules.personsNotLeaders(12, 12)).toBe(true);
    expect(DestinationRules.twelvePersonsIsNotTwelveLeaders).toBe(true);
  });

  it("37–38. completing does not activate leadership or create cell", () => {
    expect(DestinationRules.completingDoesNotActivateLeader).toBe(true);
    expect(DestinationRules.completingDoesNotCreateCell).toBe(true);
  });
});

describe("destination authz", () => {
  const leader = actor({
    roleCodes: ["leader"],
    permissionCodes: ROLE_PERMISSION_MAP.leader,
    ministryIds: ["ministry-a"],
    personId: "person-a",
  });
  const lg = actor({
    roleCodes: ["leader_general"],
    permissionCodes: ROLE_PERMISSION_MAP.leader_general,
    ministryIds: ["ministry-a"],
  });
  const other = actor({
    roleCodes: ["leader_general"],
    permissionCodes: ROLE_PERMISSION_MAP.leader_general,
    ministryIds: ["ministry-b"],
  });
  const staff = actor({
    roleCodes: ["staff"],
    permissionCodes: ROLE_PERMISSION_MAP.staff,
    ministryIds: ["ministry-a"],
  });

  it("27/30. leader and LG can mutate destination in ministry", () => {
    expect(
      canMutate(leader, "destination.manage", {
        type: "training",
        ministryId: "ministry-a",
      }),
    ).toBe(true);
    expect(
      canMutate(lg, "destination.complete_level", {
        type: "training",
        ministryId: "ministry-a",
      }),
    ).toBe(true);
  });

  it("31. cross-ministry deny", () => {
    expect(
      canMutate(other, "destination.manage", {
        type: "training",
        ministryId: "ministry-a",
      }),
    ).toBe(false);
  });

  it("staff can read/attend but not complete level", () => {
    expect(canMutate(staff, "destination.attendance", { type: "training" })).toBe(true);
    expect(canMutate(staff, "destination.complete_level", { type: "training" })).toBe(false);
  });

  it("tree-aware destination view", () => {
    expect(
      canView(
        leader,
        { type: "training", personId: "child", ministryId: "ministry-a" },
        { isDescendant: true },
      ),
    ).toBe(true);
    expect(
      canView(leader, {
        type: "training",
        personId: "sibling",
        ministryId: "ministry-a",
      }),
    ).toBe(false);
  });

  it("override only for high privilege roles", () => {
    expect(ROLE_PERMISSION_MAP.leader.includes("destination.override_requirement")).toBe(
      false,
    );
    expect(
      ROLE_PERMISSION_MAP.leader_general.includes("destination.override_requirement"),
    ).toBe(true);
    expect(
      ROLE_PERMISSION_MAP.superadmin.includes("destination.override_requirement"),
    ).toBe(true);
  });
});

describe("destination validation", () => {
  it("parses cycle / enroll / complete payloads", () => {
    expect(
      createDestinoCycleInputSchema.parse({
        level: 1,
        name: "Destino N1 Ago-Oct 2026",
        startDate: "2026-08-01",
        endDate: "2026-10-31",
      }).level,
    ).toBe(1);
    expect(
      enrollDestinoInputSchema.parse({
        personId: "11111111-1111-4111-8111-111111111111",
        cycleId: "33333333-3333-4333-8333-333333333333",
        level: 2,
      }).level,
    ).toBe(2);
    expect(
      completeDestinoLevelInputSchema.parse({
        personId: "11111111-1111-4111-8111-111111111111",
        level: 3,
      }).level,
    ).toBe(3);
  });
});

describe("phase 6 domain error codes", () => {
  it("exposes DESTINATION_* codes", () => {
    const codes = [
      "DESTINATION_LEVEL_1_NOT_ELIGIBLE",
      "DESTINATION_LEVEL_2_NOT_ELIGIBLE",
      "DESTINATION_LEVEL_3_NOT_ELIGIBLE",
      "DESTINATION_PREREQUISITE_NOT_MET",
      "DESTINATION_ALREADY_COMPLETED",
      "DESTINATION_ALREADY_ENROLLED",
      "DESTINATION_CYCLE_NOT_ACTIVE",
      "DESTINATION_ACADEMIC_NOT_COMPLETED",
      "DESTINATION_PASTORAL_REQUIREMENT_NOT_MET",
      "DESTINATION_OVERRIDE_NOT_ALLOWED",
      "DESTINATION_INVALID_LEVEL",
      "DESTINATION_ACCESS_DENIED",
      "DESTINATION_CROSS_MINISTRY_DENIED",
    ] as const;
    for (const code of codes) {
      expect(DomainErrorCode[code]).toBe(code);
    }
  });
});
