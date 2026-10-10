import { describe, expect, it } from "vitest";

import {
  aggregateMultiplication,
  filterMultiplicationRows,
  splitByLine,
  type MultiplicationReportRow,
} from "./metrics-multiplication";

function row(
  partial: Partial<MultiplicationReportRow> & { studentPersonId: string },
): MultiplicationReportRow {
  return {
    fullName: partial.studentPersonId,
    ministryId: "m1",
    networkId: "n1",
    generationDepth: 1,
    contactsListed: 15,
    wonLinked: 3,
    teamSize: 6,
    firstSix: 6,
    activeLeadersWithCell: 2,
    teamComplete: false,
    ...partial,
  };
}

describe("Multiplication hierarchical aggregates", () => {
  it("does not double-count disciples across generations", () => {
    const shared = "disciple-shared";
    const rows = [
      row({ studentPersonId: "s1", generationDepth: 0, teamSize: 2 }),
      row({ studentPersonId: "s2", generationDepth: 1, teamSize: 2 }),
    ];
    const discipleSets = new Map([
      ["s1", new Set(["a", shared])],
      ["s2", new Set([shared, "b"])],
    ]);
    const leaderSets = new Map([
      ["s1", new Set(["L1"])],
      ["s2", new Set(["L1", "L2"])],
    ]);
    const agg = aggregateMultiplication(rows, discipleSets, leaderSets);
    expect(agg.uniqueDisciples).toBe(3); // a, shared, b — not 4
    expect(agg.uniqueActiveLeaders).toBe(2); // L1, L2 — not 3
  });

  it("splitByLine separates own vs descendants without duplicating consolidated", () => {
    const rows = [
      row({ studentPersonId: "root", generationDepth: 0 }),
      row({ studentPersonId: "d1", generationDepth: 1 }),
      row({ studentPersonId: "d1", generationDepth: 1 }), // duplicate input
    ];
    const split = splitByLine(rows, "root");
    expect(split.own).toHaveLength(1);
    expect(split.consolidated.map((r) => r.studentPersonId).sort()).toEqual([
      "d1",
      "root",
    ]);
  });

  it("filters by ministry/network/generation", () => {
    const rows = [
      row({ studentPersonId: "a", ministryId: "m1", networkId: "n1", generationDepth: 1 }),
      row({ studentPersonId: "b", ministryId: "m2", networkId: "n2", generationDepth: 2 }),
    ];
    expect(filterMultiplicationRows(rows, { ministryId: "m1" })).toHaveLength(1);
    expect(filterMultiplicationRows(rows, { generationDepth: 2 })).toHaveLength(1);
  });
});
