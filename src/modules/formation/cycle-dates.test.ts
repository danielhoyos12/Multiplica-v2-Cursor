import { describe, expect, it } from "vitest";

import {
  countUniqueActiveEnrollments,
  validateCycleDates,
} from "@/modules/formation/cycle-dates";

describe("countUniqueActiveEnrollments", () => {
  it("ignores aptitud / progress — only open-cycle enrollments", () => {
    expect(
      countUniqueActiveEnrollments([
        { personId: "p1", enrollmentStatus: "enrolled", cycleStatus: "active" },
        { personId: "p1", enrollmentStatus: "enrolled", cycleStatus: "planned" },
        { personId: "p2", enrollmentStatus: "completed", cycleStatus: "active" },
        { personId: "p3", enrollmentStatus: "enrolled", cycleStatus: "closed" },
        { personId: "p4", enrollmentStatus: "paused", cycleStatus: "active" },
      ]),
    ).toBe(1);
  });

  it("returns 0 when there are no cycles/enrollments (apto alone does not count)", () => {
    expect(countUniqueActiveEnrollments([])).toBe(0);
  });
});

describe("validateCycleDates", () => {
  it("rejects end before start", () => {
    expect(
      validateCycleDates({ startDate: "2026-03-10", endDate: "2026-03-01" }),
    ).toContain("La fecha de inicio no puede ser posterior a la de finalización.");
  });

  it("rejects enrollment close after cycle end", () => {
    expect(
      validateCycleDates({
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        enrollmentOpenDate: "2026-02-01",
        enrollmentCloseDate: "2026-04-01",
      }),
    ).toContain("El cierre de inscripciones no puede ser posterior al fin del ciclo.");
  });

  it("rejects class dates outside the cycle window", () => {
    const gaps = validateCycleDates({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      classDates: [
        { moduleId: "m1", moduleCode: "C1", sessionDate: "2026-02-28" },
        { moduleId: "m2", moduleCode: "C2", sessionDate: "2026-03-10" },
      ],
    });
    expect(gaps.some((g) => g.includes("C1"))).toBe(true);
    expect(gaps.some((g) => g.includes("C2"))).toBe(false);
  });

  it("accepts coherent windows including enrollment before start", () => {
    expect(
      validateCycleDates({
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        enrollmentOpenDate: "2026-02-15",
        enrollmentCloseDate: "2026-02-28",
        classDates: [
          { moduleId: "m1", moduleName: "Clase 1", sessionDate: "2026-03-05" },
          { moduleId: "m2", moduleName: "Clase 2", sessionDate: "2026-03-12" },
        ],
      }),
    ).toEqual([]);
  });
});
