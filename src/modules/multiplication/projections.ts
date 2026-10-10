/**
 * Calendar viability projections for Plan 3–12.
 * Uses only real cycle dates — never invents schedules.
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

export type ProjectionInput = {
  /** ISO date (YYYY-MM-DD) used as "today" for evaluation. */
  asOfDate: string;
  leaderEmWindow?: CycleWindow | null;
  discipleCd1Window?: CycleWindow | null;
  discipleCd2Window?: CycleWindow | null;
  discipleReencuentroWindow?: CycleWindow | null;
  discipleEncuentroWindow?: CycleWindow | null;
  /** When disciples were / must be incorporated to UDLV. */
  udlvStartDate?: string | null;
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
 */
export function projectA(input: ProjectionInput): ProjectionResult {
  const riskWeeks = input.riskWeeks ?? 2;
  const leader = input.leaderEmWindow;
  const cd1 = input.discipleCd1Window;
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
  const leaderEndsBeforeCd1 = parseDay(leader.endDate) < parseDay(cd1.startDate);
  let status = statusFromDeadline(input.asOfDate, deadline, riskWeeks);
  if (leaderEndsBeforeCd1 && status === "EN_PLAZO") {
    status = "EN_RIESGO";
  }
  const weeksDelta = weeksBetween(input.asOfDate, deadline);

  return {
    key: "A",
    title: "Primeros 6 comienzan CD1 durante EM1 del líder",
    status,
    deadlineDate: deadline,
    weeksDelta,
    affectedCountHint: "hasta 6 discípulos (first_six)",
    nextViableCycle: status === "FUERA_DE_PLAZO" ? cd1 : null,
    actions:
      status === "EN_PLAZO"
        ? ["Inscribir a los 6 en CD1 antes del cierre de inscripción"]
        : [
            "Acelerar cierre UDLV de los 6",
            "Evaluar próximo ciclo CD1 viable",
            "No marcar meta como cumplida sin matrícula real",
          ],
    detail: `EM1 líder ${leader.startDate}→${leader.endDate}; CD1 ${cd1.startDate}→${cd1.endDate}.`,
  };
}

/**
 * Projection B: first six in CD2 + Re-Encuentro during EM2.
 */
export function projectB(input: ProjectionInput): ProjectionResult {
  const riskWeeks = input.riskWeeks ?? 2;
  const leader = input.leaderEmWindow;
  const cd2 = input.discipleCd2Window;
  const re = input.discipleReencuentroWindow;
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
        ? [
            `Desfase detectado respecto a ${deadline}`,
            "Mostrar próximo ciclo viable sin ocultar el desfase",
          ]
        : ["Supervisar matrícula CD2 y asistencia a Re-Encuentro"],
    detail: `EM2 líder ${leader.startDate}→${leader.endDate}; CD2 ${cd2.startDate}→${cd2.endDate}; RE ${re.startDate}→${re.endDate}.`,
  };
}

/**
 * Projection C: second six reach Encuentro during EM3.
 */
export function projectC(input: ProjectionInput): ProjectionResult {
  const riskWeeks = input.riskWeeks ?? 2;
  const leader = input.leaderEmWindow;
  const encuentro = input.discipleEncuentroWindow;
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

  // Deadline to win + enroll in Pre must precede Encuentro start.
  const deadline = encuentro.enrollmentCloseDate ?? encuentro.startDate;
  const status = statusFromDeadline(input.asOfDate, deadline, riskWeeks);
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
            "Fecha límite incumplida o en riesgo",
            "Identificar personas afectadas y próximo Encuentro viable",
          ],
    detail: `EM3 líder ${leader.startDate}→${leader.endDate}; Encuentro ${encuentro.startDate}→${encuentro.endDate}.`,
  };
}

export function projectAll(input: ProjectionInput): ProjectionResult[] {
  return [projectA(input), projectB(input), projectC(input)];
}
