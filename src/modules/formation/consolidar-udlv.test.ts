import { describe, expect, it } from "vitest";

import {
  canOfferCapacitacionDestino,
  deriveConsolidarLadderStatus,
  needsConsolidarUdlvRepair,
} from "@/modules/formation/consolidar-status";
import { OfficialEligibility } from "@/modules/formation/official-catalog";

describe("deriveConsolidarLadderStatus (Consolidar = UDLV)", () => {
  it("Iniciar Consolidar → En curso, not Completado", () => {
    const derived = deriveConsolidarLadderStatus({
      aggregateStatus: "in_progress",
      preStatus: "pending",
      encuentroStatus: "pending",
      postStatus: "pending",
    });
    expect(derived.status).toBe("in_progress");
    expect(derived.derivedComplete).toBe(false);
    expect(canOfferCapacitacionDestino({
      aggregateStatus: "in_progress",
      preStatus: "pending",
      encuentroStatus: "pending",
      postStatus: "pending",
    })).toBe(false);
  });

  it("false aggregate completed without UDLV stages → En curso", () => {
    const derived = deriveConsolidarLadderStatus({
      aggregateStatus: "completed",
      preStatus: "pending",
      encuentroStatus: "pending",
      postStatus: "pending",
    });
    expect(derived.status).toBe("in_progress");
    expect(derived.derivedComplete).toBe(false);
    expect(
      canOfferCapacitacionDestino({
        aggregateStatus: "completed",
        preStatus: "pending",
        encuentroStatus: "pending",
        postStatus: "pending",
      }),
    ).toBe(false);
  });

  it("progress through Pre then Encuentro keeps Consolidar in progress", () => {
    expect(
      deriveConsolidarLadderStatus({
        aggregateStatus: "in_progress",
        preStatus: "completed",
        encuentroStatus: "in_progress",
        postStatus: "pending",
      }).status,
    ).toBe("in_progress");
  });

  it("completes only when Pre + Encuentro + Post are completed", () => {
    expect(
      OfficialEligibility.consolidar("completed", "completed", "pending"),
    ).toBe(false);
    const derived = deriveConsolidarLadderStatus({
      aggregateStatus: "in_progress",
      preStatus: "completed",
      encuentroStatus: "completed",
      postStatus: "completed",
    });
    expect(derived.status).toBe("completed");
    expect(derived.derivedComplete).toBe(true);
    expect(
      canOfferCapacitacionDestino({
        aggregateStatus: "in_progress",
        preStatus: "completed",
        encuentroStatus: "completed",
        postStatus: "completed",
      }),
    ).toBe(true);
  });

  it("does not unlock Discipular / Capacitación Destino while UDLV pending", () => {
    const cases = [
      { pre: "eligible", enc: "pending", post: "pending" },
      { pre: "completed", enc: "eligible", post: "pending" },
      { pre: "completed", enc: "completed", post: "in_progress" },
    ] as const;
    for (const c of cases) {
      expect(
        canOfferCapacitacionDestino({
          aggregateStatus: "completed",
          preStatus: c.pre,
          encuentroStatus: c.enc,
          postStatus: c.post,
        }),
      ).toBe(false);
    }
  });

  it("pending aggregate with no stages stays pending", () => {
    expect(
      deriveConsolidarLadderStatus({
        aggregateStatus: "pending",
        preStatus: "pending",
        encuentroStatus: "pending",
        postStatus: "pending",
      }).status,
    ).toBe("pending");
  });
});

describe("needsConsolidarUdlvRepair (idempotent)", () => {
  it("requires repair for false completed aggregate without Pre-Encuentro", () => {
    expect(
      needsConsolidarUdlvRepair({
        derivedComplete: false,
        aggregateStatus: "completed",
        aggregateCompletedAt: 1791436136728,
        preStatus: "pending",
      }),
    ).toBe(true);
  });

  it("skips write when already in_progress with Pre open and no completedAt", () => {
    expect(
      needsConsolidarUdlvRepair({
        derivedComplete: false,
        aggregateStatus: "in_progress",
        aggregateCompletedAt: null,
        preStatus: "eligible",
      }),
    ).toBe(false);
  });

  it("skips when UDLV already complete", () => {
    expect(
      needsConsolidarUdlvRepair({
        derivedComplete: true,
        aggregateStatus: "completed",
        aggregateCompletedAt: 1,
        preStatus: "completed",
      }),
    ).toBe(false);
  });
});
