import { describe, expect, it } from "vitest";

import { DomainErrorCode } from "@/lib/errors";
import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { canMutate, type AuthContext } from "@/modules/authorization/policy";
import { SendRules } from "@/modules/send";
import { TransferRules } from "@/modules/transfers";

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

describe("SendRules", () => {
  it("1. EM3 complete → Enviar eligible", () => {
    expect(SendRules.canEnter("completed")).toBe(true);
  });
  it("2. EM3 incomplete → Enviar deny", () => {
    expect(SendRules.canEnter("in_progress")).toBe(false);
    expect(SendRules.canEnter(null)).toBe(false);
  });
  it("5–6. completar Enviar no activa liderazgo ni crea célula", () => {
    expect(SendRules.completingDoesNotActivateLeader).toBe(true);
    expect(SendRules.completingDoesNotCreateCell).toBe(true);
  });
  it("7–8. ungido ≠ active", () => {
    expect(SendRules.ungidoIsNotActive).toBe(true);
    expect(SendRules.eligibleDoesNotMeanCompleted).toBe(true);
  });
});

describe("TransferRules", () => {
  it("never lose persons / max cells / capacity", () => {
    expect(TransferRules.neverLosePersons).toBe(true);
    expect(TransferRules.maxDirectCells).toBe(2);
    expect(TransferRules.maxDirectLeaders).toBe(12);
    expect(TransferRules.executedIsIdempotent).toBe(true);
    expect(TransferRules.closureIsNotHistory).toBe(true);
  });
});

describe("phase 8 permissions", () => {
  const leader = actor({
    roleCodes: ["leader"],
    permissionCodes: ROLE_PERMISSION_MAP.leader,
    ministryIds: ["ministry-a"],
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

  it("leader can send.manage in ministry", () => {
    expect(
      canMutate(leader, "send.manage", { type: "process", ministryId: "ministry-a" }),
    ).toBe(true);
  });
  it("LG can approve transfers", () => {
    expect(
      canMutate(lg, "transfers.approve", { type: "person", ministryId: "ministry-a" }),
    ).toBe(true);
  });
  it("cross-ministry mutate deny for LG", () => {
    expect(
      canMutate(other, "transfers.execute", { type: "person", ministryId: "ministry-a" }),
    ).toBe(false);
  });
});

describe("phase 8 domain error codes", () => {
  it("exposes SEND_* and TRANSFER_* codes", () => {
    const codes = [
      "SEND_NOT_ELIGIBLE",
      "SEND_ALREADY_COMPLETED",
      "SEND_ACCESS_DENIED",
      "TRANSFER_NOT_FOUND",
      "TRANSFER_ALREADY_EXECUTED",
      "TRANSFER_NOT_APPROVED",
      "TRANSFER_INVALID_ACTOR",
      "TRANSFER_INVALID_DESTINATION",
      "TRANSFER_CROSS_MINISTRY_APPROVAL_REQUIRED",
      "TRANSFER_NETWORK_INCOMPATIBLE",
      "REASSIGNMENT_PLAN_REQUIRED",
      "REASSIGNMENT_INCOMPLETE",
      "REASSIGNMENT_WOULD_ORPHAN_PERSON",
      "LEADER_SUBTREE_MOVE_INVALID",
      "LEADER_SUBTREE_CYCLE",
      "LEADER_PARENT_CAPACITY_REACHED",
      "MAX_DIRECT_CELLS_REACHED",
      "LEADER_HAS_ACTIVE_STRUCTURE",
    ] as const;
    for (const code of codes) {
      expect(DomainErrorCode[code]).toBe(code);
    }
  });
});
