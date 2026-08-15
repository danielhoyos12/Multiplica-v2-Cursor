import { describe, expect, it } from "vitest";

import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { DomainErrorCode } from "@/lib/errors";
import {
  canMutate,
  canView,
  type AuthContext,
} from "@/modules/authorization/policy";
import { FormationRules } from "@/modules/formation/service";
import {
  completeConsolidationInputSchema,
  createCycleInputSchema,
  enrollUdvInputSchema,
  startConsolidationInputSchema,
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

describe("FormationRules", () => {
  it("legacy: consolidar completed still gates UDV catalog access", () => {
    expect(FormationRules.canEnterUdv("completed")).toBe(true);
    expect(FormationRules.canEnterUdv("in_progress")).toBe(false);
    expect(FormationRules.canEnterUdv(null)).toBe(false);
  });

  it("completing UDV never activates leadership", () => {
    expect(FormationRules.completingUdvActivatesLeader()).toBe(false);
  });

  it("official: Consolidar enables CD1; UDV is not a gate", () => {
    expect(FormationRules.consolidarEnablesCd1("completed")).toBe(true);
    expect(FormationRules.udvIsNotGateBeforeCd1).toBe(true);
  });

  it("blocks duplicate enrollment", () => {
    expect(FormationRules.duplicateEnrollmentBlocked(true)).toBe(true);
  });
});

describe("formation authz permissions", () => {
  const leader = actor({
    roleCodes: ["leader"],
    permissionCodes: ROLE_PERMISSION_MAP.leader,
    ministryIds: ["ministry-a"],
    personId: "person-a",
  });
  const sibling = actor({
    roleCodes: ["leader"],
    permissionCodes: ROLE_PERMISSION_MAP.leader,
    ministryIds: ["ministry-a"],
    personId: "person-b",
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

  it("allows process mutate in ministry for leader", () => {
    expect(
      canMutate(leader, "consolidation.manage", {
        type: "process",
        ministryId: "ministry-a",
      }),
    ).toBe(true);
  });

  it("denies cross-ministry process mutate", () => {
    expect(
      canMutate(other, "udv.manage", {
        type: "process",
        ministryId: "ministry-a",
      }),
    ).toBe(false);
  });

  it("tree-aware process view: descendant allow, sibling deny via options", () => {
    expect(
      canView(
        leader,
        { type: "process", personId: "person-a1", ministryId: "ministry-a" },
        { isDescendant: true },
      ),
    ).toBe(true);
    expect(
      canView(sibling, {
        type: "process",
        personId: "person-a",
        ministryId: "ministry-a",
      }),
    ).toBe(false);
    expect(
      canView(lg, { type: "process", personId: "x", ministryId: "ministry-a" }),
    ).toBe(true);
  });
});

describe("formation validation", () => {
  it("parses consolidar / cycle / enroll payloads", () => {
    expect(
      startConsolidationInputSchema.parse({
        personId: "11111111-1111-4111-8111-111111111111",
        ministryId: "22222222-2222-4222-8222-222222222222",
      }).personId,
    ).toBeTruthy();
    expect(
      completeConsolidationInputSchema.parse({
        personId: "11111111-1111-4111-8111-111111111111",
      }).personId,
    ).toBeTruthy();
    expect(
      createCycleInputSchema.parse({
        name: "UDV Ago-Oct 2026",
        startDate: "2026-08-01",
        endDate: "2026-10-31",
      }).name,
    ).toContain("UDV");
    expect(
      enrollUdvInputSchema.parse({
        personId: "11111111-1111-4111-8111-111111111111",
        cycleId: "33333333-3333-4333-8333-333333333333",
      }).cycleId,
    ).toBeTruthy();
  });
});

describe("phase 5 domain error codes", () => {
  it("exposes process/UDV codes", () => {
    const codes = [
      "PROCESS_NOT_FOUND",
      "PROCESS_ACCESS_DENIED",
      "CONSOLIDATION_ALREADY_COMPLETED",
      "CONSOLIDATION_REQUIRED",
      "UDV_NOT_ELIGIBLE",
      "UDV_ALREADY_ENROLLED",
      "UDV_CYCLE_NOT_ACTIVE",
      "UDV_ALREADY_COMPLETED",
      "TRAINING_MODULE_INACTIVE",
      "ATTENDANCE_ALREADY_RECORDED",
      "ATTENDANCE_RECOVERY_NOT_AUTHORIZED",
      "CYCLE_ALREADY_ACTIVE",
      "CYCLE_ALREADY_CLOSED",
      "CROSS_MINISTRY_PROCESS_DENIED",
    ] as const;
    for (const code of codes) {
      expect(DomainErrorCode[code]).toBe(code);
    }
  });
});
