import { describe, expect, it } from "vitest";

import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { DomainErrorCode } from "@/lib/errors";
import { canMutate, type AuthContext } from "@/modules/authorization/policy";
import { EmLevelRules } from "@/modules/formation/em-levels";
import { MinisterialRules } from "@/modules/formation/ministerial";
import { ReencuentroRules } from "@/modules/formation/reencounter";
import {
  completeEmInputSchema,
  completeReencuentroInputSchema,
  createEmCycleInputSchema,
  enrollEmInputSchema,
  enrollReencuentroInputSchema,
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

describe("EmLevelRules (official)", () => {
  it("CD3 completed → EM1 eligible", () => {
    expect(EmLevelRules.canEnterEm1("completed")).toBe(true);
  });
  it("CD3 incomplete → EM1 deny", () => {
    expect(EmLevelRules.canEnterEm1("in_progress")).toBe(false);
    expect(EmLevelRules.canEnterEm1(null)).toBe(false);
  });
  it("completing EM does not activate leader", () => {
    expect(EmLevelRules.completingDoesNotActivateLeader).toBe(true);
  });
});

describe("MinisterialRules (legacy single EM — kept for compat)", () => {
  it("legacy canEnter still keyed off N3 completed", () => {
    expect(MinisterialRules.canEnter("completed")).toBe(true);
  });
  it("eligibility does not enroll", () => {
    expect(MinisterialRules.eligibilityDoesNotEnroll).toBe(true);
  });
  it("academic separate from completed", () => {
    expect(MinisterialRules.academicSeparateFromCompleted).toBe(true);
  });
});

describe("ReencuentroRules (official: after CD2)", () => {
  it("CD2 completed → Re-Encuentro eligible", () => {
    expect(ReencuentroRules.canEnter("completed")).toBe(true);
  });
  it("CD2 incomplete → deny", () => {
    expect(ReencuentroRules.canEnter("academic_completed")).toBe(false);
  });
  it("next stage is CD3 — not after Escuela Ministerial", () => {
    expect(ReencuentroRules.nextStageIsCd3).toBe(true);
    expect(ReencuentroRules.notAfterEscuelaMinisterial).toBe(true);
  });
  it("completing does not activate leader", () => {
    expect(ReencuentroRules.completingDoesNotActivateLeader).toBe(true);
  });
});

describe("phase 7 authz permissions", () => {
  const leader = actor({
    roleCodes: ["leader"],
    permissionCodes: ROLE_PERMISSION_MAP.leader,
    ministryIds: ["ministry-a"],
  });
  const other = actor({
    roleCodes: ["leader_general"],
    permissionCodes: ROLE_PERMISSION_MAP.leader_general,
    ministryIds: ["ministry-b"],
  });

  it("leader can manage EM/RE in ministry", () => {
    expect(
      canMutate(leader, "ministerial_school.manage", {
        type: "training",
        ministryId: "ministry-a",
      }),
    ).toBe(true);
    expect(
      canMutate(leader, "reencounter.complete", {
        type: "training",
        ministryId: "ministry-a",
      }),
    ).toBe(true);
  });

  it("cross-ministry deny", () => {
    expect(
      canMutate(other, "ministerial_school.manage", {
        type: "training",
        ministryId: "ministry-a",
      }),
    ).toBe(false);
  });
});

describe("phase 7 validation", () => {
  it("parses EM / Reencuentro payloads", () => {
    expect(
      createEmCycleInputSchema.parse({
        name: "EM Ago-Nov 2026",
        startDate: "2026-08-01",
        endDate: "2026-11-30",
      }).name,
    ).toContain("EM");
    expect(
      enrollEmInputSchema.parse({
        personId: "11111111-1111-4111-8111-111111111111",
        cycleId: "33333333-3333-4333-8333-333333333333",
      }).cycleId,
    ).toBeTruthy();
    expect(
      completeEmInputSchema.parse({
        personId: "11111111-1111-4111-8111-111111111111",
      }).personId,
    ).toBeTruthy();
    expect(
      enrollReencuentroInputSchema.parse({
        personId: "11111111-1111-4111-8111-111111111111",
        cycleId: "33333333-3333-4333-8333-333333333333",
      }).cycleId,
    ).toBeTruthy();
    expect(
      completeReencuentroInputSchema.parse({
        personId: "11111111-1111-4111-8111-111111111111",
      }).personId,
    ).toBeTruthy();
  });
});

describe("phase 7 domain error codes", () => {
  it("exposes EM and Reencuentro codes", () => {
    const codes = [
      "MINISTERIAL_SCHOOL_NOT_ELIGIBLE",
      "MINISTERIAL_SCHOOL_ALREADY_ENROLLED",
      "MINISTERIAL_SCHOOL_CYCLE_NOT_ACTIVE",
      "MINISTERIAL_SCHOOL_ACADEMIC_NOT_COMPLETED",
      "MINISTERIAL_SCHOOL_REQUIREMENT_NOT_MET",
      "MINISTERIAL_SCHOOL_ALREADY_COMPLETED",
      "MINISTERIAL_SCHOOL_ACCESS_DENIED",
      "REENCOUNTER_NOT_ELIGIBLE",
      "REENCOUNTER_ALREADY_ENROLLED",
      "REENCOUNTER_EVENT_NOT_ACTIVE",
      "REENCOUNTER_ALREADY_COMPLETED",
      "REENCOUNTER_ACCESS_DENIED",
      "CROSS_MINISTRY_PROCESS_DENIED",
    ] as const;
    for (const code of codes) {
      expect(DomainErrorCode[code]).toBeDefined();
    }
  });
});
