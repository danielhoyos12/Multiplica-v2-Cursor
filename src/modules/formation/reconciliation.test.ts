import { describe, expect, it } from "vitest";

import { ConsolidarRules } from "@/modules/formation/consolidar-stages";
import { DestinationRules } from "@/modules/formation/destination";
import { EmLevelRules } from "@/modules/formation/em-levels";
import {
  countCatalogExpectation,
  OfficialEligibility,
  OFFICIAL_SEQUENCE,
} from "@/modules/formation/official-catalog";
import { ReencuentroRules } from "@/modules/formation/reencounter";
import { FormationRules } from "@/modules/formation/service";

describe("OfficialEligibility — Consolidar", () => {
  it("1. persona puede entrar a Pre-Encuentro", () => {
    expect(OfficialEligibility.preEncuentro()).toBe(true);
  });
  it("2. Pre incompleto bloquea Encuentro", () => {
    expect(OfficialEligibility.encuentro("in_progress")).toBe(false);
    expect(OfficialEligibility.encuentro(null)).toBe(false);
  });
  it("3. Pre completed habilita Encuentro", () => {
    expect(OfficialEligibility.encuentro("completed")).toBe(true);
  });
  it("4. Encuentro incompleto bloquea Post", () => {
    expect(OfficialEligibility.postEncuentro("eligible")).toBe(false);
  });
  it("5. Encuentro completed habilita Post", () => {
    expect(OfficialEligibility.postEncuentro("completed")).toBe(true);
  });
  it("6. Post completed completa Consolidar", () => {
    expect(OfficialEligibility.consolidar("completed", "completed", "completed")).toBe(
      true,
    );
  });
  it("7. Consolidar no se completa antes de las tres etapas", () => {
    expect(OfficialEligibility.consolidar("completed", "completed", "in_progress")).toBe(
      false,
    );
    expect(OfficialEligibility.consolidar("completed", null, "completed")).toBe(false);
  });
  it("8–9. 4 clases Pre/Post y 3 días Encuentro", () => {
    expect(ConsolidarRules.preClassCount).toBe(4);
    expect(ConsolidarRules.postClassCount).toBe(4);
    expect(ConsolidarRules.encuentroDays).toBe(3);
  });
});

describe("OfficialEligibility — Discipular sequence", () => {
  it("13. Consolidar completed → CD1 eligible", () => {
    expect(OfficialEligibility.cd1("completed")).toBe(true);
    expect(DestinationRules.canEnterLevel1("completed")).toBe(true);
  });
  it("14. Consolidar incomplete → CD1 deny", () => {
    expect(OfficialEligibility.cd1("in_progress")).toBe(false);
    expect(DestinationRules.canEnterLevel1(null)).toBe(false);
  });
  it("15–16. CD1 → CD2 gates", () => {
    expect(OfficialEligibility.cd2("completed")).toBe(true);
    expect(OfficialEligibility.cd2("academic_completed")).toBe(false);
  });
  it("17–18. CD2 → Re-Encuentro", () => {
    expect(OfficialEligibility.reencuentro("completed")).toBe(true);
    expect(ReencuentroRules.canEnter("completed")).toBe(true);
    expect(ReencuentroRules.canEnter("in_progress")).toBe(false);
    expect(ReencuentroRules.notAfterEscuelaMinisterial).toBe(true);
  });
  it("19–20. CD3 requires CD2 + Re-Encuentro", () => {
    expect(OfficialEligibility.cd3("completed", "in_progress")).toBe(false);
    expect(OfficialEligibility.cd3("completed", "completed")).toBe(true);
    expect(DestinationRules.canEnterLevel3(true, false)).toBe(false);
    expect(DestinationRules.canEnterLevel3(true, true)).toBe(true);
  });
  it("21–24. EM1→EM2→EM3→next", () => {
    expect(EmLevelRules.canEnterEm1("completed")).toBe(true);
    expect(OfficialEligibility.em1("completed")).toBe(true);
    expect(OfficialEligibility.em2("completed")).toBe(true);
    expect(OfficialEligibility.em3("completed")).toBe(true);
    expect(OfficialEligibility.nextStage("completed")).toBe(true);
    expect(OfficialEligibility.nextStage("in_progress")).toBe(false);
  });
  it("25. no saltar etapas — secuencia oficial ordenada", () => {
    expect(OFFICIAL_SEQUENCE).toEqual([
      "pre_encuentro",
      "encuentro",
      "post_encuentro",
      "destino_n1",
      "destino_n2",
      "reencuentro",
      "destino_n3",
      "em1",
      "em2",
      "em3",
    ]);
  });
});

describe("Doctrina / Seminario catalog expectations", () => {
  it("26–37. 10+10 por nivel CD/EM", () => {
    const exp = countCatalogExpectation();
    expect(exp.cdDoctrina).toBe(10);
    expect(exp.cdSeminario).toBe(10);
    expect(exp.emDoctrina).toBe(10);
    expect(exp.emSeminario).toBe(10);
    expect(exp.pre).toBe(4);
    expect(exp.post).toBe(4);
    expect(exp.encuentroDays).toBe(3);
  });
});

describe("Integrity invariants", () => {
  it("39–42. no auto leadership / eligible ≠ enroll / UDV not gate", () => {
    expect(DestinationRules.completingDoesNotActivateLeader).toBe(true);
    expect(DestinationRules.completingDoesNotCreateCell).toBe(true);
    expect(DestinationRules.eligibilityDoesNotEnroll).toBe(true);
    expect(DestinationRules.udvIsNotGateBeforeCd1).toBe(true);
    expect(FormationRules.udvIsNotGateBeforeCd1).toBe(true);
    expect(FormationRules.consolidarEnablesCd1("completed")).toBe(true);
    expect(ReencuentroRules.nextStageIsCd3).toBe(true);
    expect(EmLevelRules.completingDoesNotActivateLeader).toBe(true);
  });
  it("31. 12 personas != 12 líderes G12", () => {
    expect(DestinationRules.twelvePersonsIsNotTwelveLeaders).toBe(true);
  });
});
