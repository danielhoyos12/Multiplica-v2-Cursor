import { describe, expect, it } from "vitest";

import { assertNoDuplicateSlots, countContacts, countTeam } from "./progress";
import { canMarkActiveLeader, evaluateObjectives } from "./objectives";
import { projectA, projectB, projectC } from "./projections";

describe("Plan 3–12 progress counters", () => {
  it("does not count 15 contacts as won persons", () => {
    const contacts = Array.from({ length: 15 }, (_, i) => ({
      orderIndex: i + 1,
      status: "contact" as const,
      linkedPersonId: null,
    }));
    const c = countContacts(contacts);
    expect(c.listed).toBe(15);
    expect(c.wonLinked).toBe(0);
  });

  it("prevents duplicate persons in team of 12", () => {
    const errors = assertNoDuplicateSlots([
      {
        personId: "p1",
        slotIndex: 1,
        cohort: "first_six",
        formationStatus: "en_formacion",
      },
      {
        personId: "p1",
        slotIndex: 2,
        cohort: "first_six",
        formationStatus: "en_formacion",
      },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("active leader requires cell evidence in counter", () => {
    const team = countTeam([
      {
        personId: "a",
        slotIndex: 1,
        cohort: "first_six",
        formationStatus: "lider_activo_celula",
        cellId: "c1",
      },
      {
        personId: "b",
        slotIndex: 2,
        cohort: "first_six",
        formationStatus: "lider_activo_celula",
        cellId: null,
      },
    ]);
    expect(team.activeLeadersWithCell).toBe(1);
  });
});

describe("Ministerial objectives from evidence", () => {
  it("CD1 lista 15 + 3 ganados", () => {
    const objs = evaluateObjectives({
      contactsListed: 15,
      contactsWonLinked: 3,
      firstSixPersonIds: ["a", "b", "c"],
      secondSixPersonIds: [],
      teamPersonIds: ["a", "b", "c"],
      firstSixWithActiveCell: 0,
      activeLeadersWithCell: 0,
      firstSixInCd1: 0,
      firstSixInCd2: 0,
      firstSixInReencuentro: 0,
      secondSixEncuentroCompleted: 0,
    });
    expect(objs.find((o) => o.key === "lista_15")?.status).toBe("met");
    expect(objs.find((o) => o.key === "ganar_3")?.status).toBe("met");
  });

  it("blocks active leader without cell + pastoral auth", () => {
    expect(
      canMarkActiveLeader({
        hasActivatePermission: true,
        cellId: null,
        cellActive: false,
        leadershipStatus: "eligible",
      }).ok,
    ).toBe(false);
    expect(
      canMarkActiveLeader({
        hasActivatePermission: true,
        cellId: "c1",
        cellActive: true,
        leadershipStatus: "active",
      }).ok,
    ).toBe(true);
  });
});

describe("Calendar projections with dependency chain", () => {
  it("A without cycles → SIN_CALENDARIO_SUFICIENTE", () => {
    const r = projectA({ asOfDate: "2026-10-10" });
    expect(r.status).toBe("SIN_CALENDARIO_SUFICIENTE");
  });

  it("A does not declare EN_PLAZO only because CD1 sits inside EM1", () => {
    const r = projectA({
      asOfDate: "2026-01-01",
      leaderEmWindow: {
        code: "em1",
        name: "EM1",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      },
      discipleCd1Window: {
        code: "cd1",
        name: "CD1",
        startDate: "2026-02-01",
        endDate: "2026-04-01",
        enrollmentCloseDate: "2026-01-25",
      },
      chain: { cohortSize: 6, postCompleted: 0 },
    });
    expect(r.status).toBe("SIN_CALENDARIO_SUFICIENTE");
  });

  it("A EN_PLAZO when UDLV already complete for cohort", () => {
    const r = projectA({
      asOfDate: "2026-01-01",
      leaderEmWindow: {
        code: "em1",
        name: "EM1",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      },
      discipleCd1Window: {
        code: "cd1",
        name: "CD1",
        startDate: "2026-02-01",
        endDate: "2026-04-01",
        enrollmentCloseDate: "2026-01-25",
      },
      chain: { cohortSize: 6, postCompleted: 6 },
    });
    expect(r.status).toBe("EN_PLAZO");
  });

  it("B late when deadline before asOf", () => {
    const r = projectB({
      asOfDate: "2026-10-10",
      leaderEmWindow: {
        code: "em2",
        name: "EM2",
        startDate: "2026-01-01",
        endDate: "2026-03-01",
      },
      discipleCd2Window: {
        code: "cd2",
        name: "CD2",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
      },
      discipleReencuentroWindow: {
        code: "re",
        name: "RE",
        startDate: "2026-02-01",
        endDate: "2026-02-15",
      },
      chain: { cohortSize: 6, cd1StartedOrDone: 6 },
    });
    expect(r.status).toBe("FUERA_DE_PLAZO");
    expect(r.weeksDelta).not.toBeNull();
    expect((r.weeksDelta as number) < 0).toBe(true);
  });

  it("B indeterminate when CD1 chain incomplete", () => {
    const r = projectB({
      asOfDate: "2026-01-10",
      leaderEmWindow: {
        code: "em2",
        name: "EM2",
        startDate: "2026-01-01",
        endDate: "2026-06-01",
      },
      discipleCd2Window: {
        code: "cd2",
        name: "CD2",
        startDate: "2026-03-01",
        endDate: "2026-05-01",
      },
      discipleReencuentroWindow: {
        code: "re",
        name: "RE",
        startDate: "2026-05-01",
        endDate: "2026-05-15",
      },
      chain: { cohortSize: 6, cd1StartedOrDone: 2 },
    });
    expect(r.status).toBe("SIN_CALENDARIO_SUFICIENTE");
  });

  it("C incompatible calendars", () => {
    const r = projectC({ asOfDate: "2026-10-10", leaderEmWindow: null });
    expect(r.status).toBe("SIN_CALENDARIO_SUFICIENTE");
    expect(r.deadlineDate).toBeNull();
  });
});
