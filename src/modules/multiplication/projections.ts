/**
 * Calendar viability projections for Plan 3–12.
 * Uses only real cycle dates — never invents schedules.
 * Status vocabulary for UAT:
 * - EN_PLAZO: viable with verified dates + prior academic chain ready
 * - EN_RIESGO / FUERA_DE_PLAZO: not viable / slip
 * - SIN_CALENDARIO_SUFICIENTE: indeterminate — missing calendar or prerequisites
 */

export type ProjectionStatus =
  | "EN_PLAZO"
  | "EN_RIESGO"
  | "FUERA_DE_PLAZO"
  | "SIN_CALENDARIO_SUFICIENTE";

export type CycleWindow = {
  code: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  enrollmentCloseDate?: string | null;
};

export type ChainProgress = {
  /** How many of the target cohort already finished Pre */
  preCompleted?: number;
  encuentroCompleted?: number;
  postCompleted?: number;
  cd1StartedOrDone?: number;
  cohortSize?: number;
  /** Estimated weeks still needed for remaining UDLV (from catalog: 4+event+4) when unknown */
  remainingFormationWeeksHint?: number | null;
};

export type ProjectionInput = {
  asOfDate: string;
  leaderEmWindow?: CycleWindow | null;
  discipleCd1Window?: CycleWindow | null;
  discipleCd2Window?: CycleWindow | null;
  discipleReencuentroWindow?: CycleWindow | null;
  discipleEncuentroWindow?: CycleWindow | null;
  disciplePreWindow?: CycleWindow | null;
  disciplePostWindow?: CycleWindow | null;
  chain?: ChainProgress | null;
  riskWeeks?: number;
};

export type ProjectionResult = {
  key: "A" | "B" | "C";
  title: string;
  status: ProjectionStatus;
  deadlineDate: string | null;
  weeksDelta: number | null;
  affectedCountHint: string;
  nextViableCycle: CycleWindow | null;
  actions: string[];
  detail: string;
};

function parseDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

function weeksBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDay(toIso) - parseDay(fromIso)) / 7);
}

function statusFromDeadline(
  asOf: string,
  deadline: string | null,
  riskWeeks: number,
): ProjectionStatus {
  if (!deadline) return "SIN_CALENDARIO_SUFICIENTE";
  const weeks = weeksBetween(asOf, deadline);
  if (weeks < 0) return "FUERA_DE_PLAZO";
  if (weeks <= riskWeeks) return "EN_RIESGO";
  return "EN_PLAZO";
}

/**
 * Projection A: first six should start CD1 while leader is in EM1.
 * Requires verified EM1 + CD1 windows AND enough calendar slack for
 * remaining Pre→Encuentro→Post before CD1 enrollment close.
 */
export function projectA(input: ProjectionInput): ProjectionResult {
  const riskWeeks = input.riskWeeks ?? 2;
  const leader = input.leaderEmWindow;
  const cd1 = input.discipleCd1Window;
  const cohort = input.chain?.cohortSize ?? 6;
  const postDone = input.chain?.postCompleted ?? 0;
  const remaining = Math.max(0, cohort - postDone);
  // Catalog-aligned minimum: Pre 4 sessions + Encuentro window + Post 4 ≈ treat as weeks from available cycles when present.
  const preWeeks = input.disciplePreWindow
    ? Math.max(1, weeksBetween(input.disciplePreWindow.startDate, input.disciplePreWindow.endDate))
    : null;
  const encWeeks = input.discipleEncuentroWindow
    ? Math.max(
        1,
        weeksBetween(
          input.discipleEncuentroWindow.startDate,
          input.discipleEncuentroWindow.endDate,
        ),
      )
    : null;
  const postWeeks = input.disciplePostWindow
    ? Math.max(1, weeksBetween(input.disciplePostWindow.startDate, input.disciplePostWindow.endDate))
    : null;

  if (!leader || !cd1) {
    return {
      key: "A",
      title: "Primeros 6 comienzan CD1 durante EM1 del líder",
      status: "SIN_CALENDARIO_SUFICIENTE",
      deadlineDate: null,
      weeksDelta: null,
      affectedCountHint: "hasta 6 discípulos",
      nextViableCycle: cd1 ?? null,
      actions: [
        "Configurar ciclo EM1 del líder con fechas reales",
        "Configurar ciclo CD1 disponible para los discípulos",
      ],
      detail: "Faltan ventanas de calendario reales para EM1 y/o CD1.",
    };
  }

  const deadline = cd1.enrollmentCloseDate ?? cd1.startDate;
  const weeksToDeadline = weeksBetween(input.asOfDate, deadline);
  const neededWeeks =
    remaining === 0
      ? 0
      : (preWeeks ?? input.chain?.remainingFormationWeeksHint ?? null) !== null &&
          encWeeks !== null &&
          postWeeks !== null
        ? (preWeeks ?? 0) + encWeeks + postWeeks
        : remaining > 0
          ? null
          : 0;

  // Cannot declare EN_PLAZO only because CD1 close is inside EM1 — need formation chain slack.
  if (remaining > 0 && neededWeeks === null) {
    return {
      key: "A",
      title: "Primeros 6 comienzan CD1 durante EM1 del líder",
      status: "SIN_CALENDARIO_SUFICIENTE",
      deadlineDate: deadline,
      weeksDelta: weeksToDeadline,
      affectedCountHint: `${remaining} aún sin Post/UDLV completa`,
      nextViableCycle: cd1,
      actions: [
        "Definir ciclos Pre/Encuentro/Post con fechas reales para estimar la cadena",
        "No marcar EN_PLAZO solo por solape CD1⊂EM1",
      ],
      detail: `EM1 ${leader.startDate}→${leader.endDate}; CD1 ${cd1.startDate}→${cd1.endDate}. UDLV completa: ${postDone}/${cohort}.`,
    };
  }

  let status = statusFromDeadline(input.asOfDate, deadline, riskWeeks);
  if (neededWeeks !== null && weeksToDeadline < neededWeeks) {
    status = weeksToDeadline < 0 ? "FUERA_DE_PLAZO" : "FUERA_DE_PLAZO";
  }
  if (
    status === "EN_PLAZO" &&
    parseDay(leader.endDate) < parseDay(cd1.startDate)
  ) {
    status = "EN_RIESGO";
  }

  return {
    key: "A",
    title: "Primeros 6 comienzan CD1 durante EM1 del líder",
    status,
    deadlineDate: deadline,
    weeksDelta: weeksToDeadline,
    affectedCountHint: "hasta 6 discípulos (first_six)",
    nextViableCycle: status === "FUERA_DE_PLAZO" ? cd1 : null,
    actions:
      status === "EN_PLAZO"
        ? ["Inscribir a los 6 en CD1 antes del cierre de inscripción"]
        : [
            "Acelerar cierre UDLV de los rezagados",
            "Evaluar próximo ciclo CD1 viable",
            "No marcar meta cumplida sin matrícula real",
          ],
    detail: `EM1 líder ${leader.startDate}→${leader.endDate}; CD1 ${cd1.startDate}→${cd1.endDate}; cadena UDLV ${postDone}/${cohort}${neededWeeks != null ? `; semanas formación estimadas ${neededWeeks}` : ""}.`,
  };
}

export function projectB(input: ProjectionInput): ProjectionResult {
  const riskWeeks = input.riskWeeks ?? 2;
  const leader = input.leaderEmWindow;
  const cd2 = input.discipleCd2Window;
  const re = input.discipleReencuentroWindow;
  const cd1Done = input.chain?.cd1StartedOrDone ?? 0;
  const cohort = input.chain?.cohortSize ?? 6;

  if (!leader || !cd2 || !re) {
    return {
      key: "B",
      title: "Primeros 6 en CD2 y Re-Encuentro durante EM2",
      status: "SIN_CALENDARIO_SUFICIENTE",
      deadlineDate: null,
      weeksDelta: null,
      affectedCountHint: "hasta 6 discípulos",
      nextViableCycle: cd2 ?? re ?? null,
      actions: ["Completar calendario CD2 y Re-Encuentro con fechas reales"],
      detail: "Faltan ciclos CD2 y/o Re-Encuentro configurados.",
    };
  }

  if (cd1Done < cohort) {
    return {
      key: "B",
      title: "Primeros 6 en CD2 y Re-Encuentro durante EM2",
      status: "SIN_CALENDARIO_SUFICIENTE",
      deadlineDate: re.endDate,
      weeksDelta: weeksBetween(input.asOfDate, re.endDate),
      affectedCountHint: `${cohort - cd1Done} sin CD1 suficiente`,
      nextViableCycle: cd2,
      actions: [
        "Completar CD1 de la cohorte antes de proyectar CD2/RE",
        "Mostrar desfase sin ocultarlo",
      ],
      detail: `Prerrequisito CD1: ${cd1Done}/${cohort}. EM2 ${leader.startDate}→${leader.endDate}.`,
    };
  }

  const deadline = re.endDate < cd2.endDate ? re.endDate : cd2.endDate;
  const status = statusFromDeadline(input.asOfDate, deadline, riskWeeks);
  return {
    key: "B",
    title: "Primeros 6 en CD2 y Re-Encuentro durante EM2",
    status,
    deadlineDate: deadline,
    weeksDelta: weeksBetween(input.asOfDate, deadline),
    affectedCountHint: "hasta 6 discípulos (first_six)",
    nextViableCycle: status === "FUERA_DE_PLAZO" ? re : null,
    actions:
      status === "FUERA_DE_PLAZO"
        ? [`Desfase respecto a ${deadline}`, "Próximo ciclo viable sin ocultar el desfase"]
        : ["Supervisar matrícula CD2 y asistencia a Re-Encuentro"],
    detail: `EM2 ${leader.startDate}→${leader.endDate}; CD2 ${cd2.startDate}→${cd2.endDate}; RE ${re.startDate}→${re.endDate}.`,
  };
}

export function projectC(input: ProjectionInput): ProjectionResult {
  const riskWeeks = input.riskWeeks ?? 2;
  const leader = input.leaderEmWindow;
  const encuentro = input.discipleEncuentroWindow;
  const pre = input.disciplePreWindow;

  if (!leader || !encuentro) {
    return {
      key: "C",
      title: "Últimos 6 llegan al Encuentro durante EM3",
      status: "SIN_CALENDARIO_SUFICIENTE",
      deadlineDate: null,
      weeksDelta: null,
      affectedCountHint: "hasta 6 discípulos (second_six)",
      nextViableCycle: encuentro ?? null,
      actions: [
        "Definir ciclo/evento de Encuentro con fechas reales",
        "Preparar contactos desde EM2 (no asumir ingreso inmediato)",
      ],
      detail: "Sin calendario de Encuentro no se puede validar la meta.",
    };
  }

  const deadline = encuentro.enrollmentCloseDate ?? encuentro.startDate;
  let status = statusFromDeadline(input.asOfDate, deadline, riskWeeks);
  if (!pre && status === "EN_PLAZO") {
    // Missing Pre calendar → cannot guarantee path to Encuentro.
    status = "SIN_CALENDARIO_SUFICIENTE";
  } else if (pre) {
    const preEnd = pre.endDate;
    if (parseDay(preEnd) > parseDay(encuentro.startDate) && status === "EN_PLAZO") {
      status = "EN_RIESGO";
    }
  }

  return {
    key: "C",
    title: "Últimos 6 llegan al Encuentro durante EM3",
    status,
    deadlineDate: deadline,
    weeksDelta: weeksBetween(input.asOfDate, deadline),
    affectedCountHint: "hasta 6 discípulos (second_six)",
    nextViableCycle: status === "FUERA_DE_PLAZO" ? encuentro : null,
    actions:
      status === "EN_PLAZO"
        ? [
            "Ganar e inscribir en Pre-Encuentro con margen antes del Encuentro",
            "No asumir que ganar en la primera semana de EM3 garantiza cupo",
          ]
        : [
            "Fecha límite incumplida, en riesgo o sin cadena Pre→Encuentro",
            "Identificar personas afectadas y próximo Encuentro viable",
          ],
    detail: `EM3 ${leader.startDate}→${leader.endDate}; Encuentro ${encuentro.startDate}→${encuentro.endDate}${pre ? `; Pre ${pre.startDate}→${pre.endDate}` : "; Pre sin calendario"}.`,
  };
}

export function projectAll(input: ProjectionInput): ProjectionResult[] {
  return [projectA(input), projectB(input), projectC(input)];
}
