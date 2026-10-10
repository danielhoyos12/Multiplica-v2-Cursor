import { describe, expect, it } from "vitest";

import {
  canApproveWithAttendance,
  countAttendedRequired,
} from "./attendance-requirements";

describe("Attendance requirement gates", () => {
  it("rejects approval without enrollment", () => {
    const r = canApproveWithAttendance({
      presentOrRecovered: 4,
      requiredCount: 4,
      enrolled: false,
      status: "in_progress",
    });
    expect(r.ok).toBe(false);
    expect(r.gaps.some((g) => g.includes("inscripción"))).toBe(true);
  });

  it("rejects approval while still eligible/pending", () => {
    const r = canApproveWithAttendance({
      presentOrRecovered: 4,
      requiredCount: 4,
      enrolled: true,
      status: "eligible",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects approval with incomplete attendance", () => {
    const r = canApproveWithAttendance({
      presentOrRecovered: 2,
      requiredCount: 4,
      enrolled: true,
      status: "in_progress",
    });
    expect(r.ok).toBe(false);
    expect(r.gaps.some((g) => g.includes("Asistencia"))).toBe(true);
  });

  it("allows approval when enrolled, in progress, and attendance complete", () => {
    const r = canApproveWithAttendance({
      presentOrRecovered: 4,
      requiredCount: 4,
      enrolled: true,
      status: "in_progress",
    });
    expect(r.ok).toBe(true);
  });

  it("counts present and recovered only", () => {
    const { presentOrRecovered, missing } = countAttendedRequired(
      ["m1", "m2", "m3"],
      { m1: "present", m2: "absent", m3: "recovered" },
    );
    expect(presentOrRecovered).toBe(2);
    expect(missing).toEqual(["m2"]);
  });
});

describe("UDLV → CD1 advance rules (regression)", () => {
  it("OfficialEligibility consolidar requires three completed stages", async () => {
    const { OfficialEligibility } = await import("./official-catalog");
    expect(OfficialEligibility.consolidar("completed", "completed", "pending")).toBe(false);
    expect(OfficialEligibility.consolidar("completed", "completed", "completed")).toBe(true);
  });

  it("deriveConsolidarLadderStatus blocks Destino when UDLV incomplete", async () => {
    const { canOfferCapacitacionDestino } = await import("./consolidar-status");
    expect(
      canOfferCapacitacionDestino({
        aggregateStatus: "completed",
        preStatus: "completed",
        encuentroStatus: "completed",
        postStatus: "pending",
      }),
    ).toBe(false);
  });
});
