/**
 * Ministerial objectives for Plan 3–12 — computed from real evidence shapes.
 * Pure functions so tests can assert without Convex.
 */

export type ObjectiveStatus = "met" | "partial" | "pending" | "blocked";

export type ObjectiveResult = {
  level: string;
  key: string;
  label: string;
  status: ObjectiveStatus;
  current: number;
  target: number;
  detail: string;
};

export type EvidenceSnapshot = {
  contactsListed: number;
  contactsWonLinked: number;
  firstSixPersonIds: string[];
  secondSixPersonIds: string[];
  /** Unique disciple person ids in team (max 12). */
  teamPersonIds: string[];
  /** first_six with active cell linked */
  firstSixWithActiveCell: number;
  /** disciples with formationStatus lider_activo_celula + cellId */
  activeLeadersWithCell: number;
  /** first_six currently in CD1 (eligible|in_progress|academic_completed|completed) */
  firstSixInCd1: number;
  firstSixInCd2: number;
  firstSixInReencuentro: number;
  /** second_six with encuentro completed */
  secondSixEncuentroCompleted: number;
};

function result(
  level: string,
  key: string,
  label: string,
  current: number,
  target: number,
  detail: string,
): ObjectiveResult {
  const status: ObjectiveStatus =
    current >= target ? "met" : current > 0 ? "partial" : "pending";
  return { level, key, label, status, current, target, detail };
}

export function evaluateObjectives(evidence: EvidenceSnapshot): ObjectiveResult[] {
  const uniqueTeam = new Set(evidence.teamPersonIds).size;
  return [
    result(
      "cd1",
      "lista_15",
      "Lista de 15 contactos",
      evidence.contactsListed,
      15,
      "Contactos evangelísticos (no son Personas Maestras hasta vincularse).",
    ),
    result(
      "cd1",
      "ganar_3",
      "Al menos 3 ganados registrados en Ganar",
      evidence.contactsWonLinked,
      3,
      "Solo cuentan contactos won con linkedPersonId real.",
    ),
    result(
      "cd2",
      "abrir_celula_3",
      "Célula activa con primeros 3",
      evidence.firstSixWithActiveCell >= 3 && evidence.firstSixPersonIds.length >= 3 ? 1 : 0,
      1,
      `Primeros 6 con célula activa: ${evidence.firstSixWithActiveCell}/3 mínimo.`,
    ),
    result(
      "cd3",
      "seis_completos",
      "6 discípulos en el equipo",
      Math.min(uniqueTeam, 6),
      6,
      `Equipo único actual: ${uniqueTeam}/12.`,
    ),
    result(
      "em1",
      "seis_en_cd1",
      "Primeros 6 cursando/completando CD1",
      evidence.firstSixInCd1,
      6,
      "Estados CD1: eligible|in_progress|academic_completed|completed.",
    ),
    result(
      "em2",
      "seis_en_cd2",
      "Primeros 6 en CD2",
      evidence.firstSixInCd2,
      6,
      "Progreso destino_n2 en curso o completado.",
    ),
    result(
      "em2",
      "seis_en_reencuentro",
      "Primeros 6 en Re-Encuentro",
      evidence.firstSixInReencuentro,
      6,
      "Progreso reencuentro en curso o completado.",
    ),
    result(
      "em3",
      "equipo_12",
      "Equipo de 12 discípulos",
      uniqueTeam,
      12,
      "Personas únicas en slots 1–12.",
    ),
    result(
      "em3",
      "seis_lideres_activos",
      "6 líderes activos con célula",
      evidence.activeLeadersWithCell,
      6,
      "Requieren formationStatus=lider_activo_celula + cellId (y autorización pastoral).",
    ),
    result(
      "em3",
      "ultimos_6_en_encuentro",
      "Últimos 6 completaron Encuentro",
      evidence.secondSixEncuentroCompleted,
      6,
      "Cohorte second_six con proceso encuentro = completed.",
    ),
  ];
}

export function canMarkActiveLeader(params: {
  hasActivatePermission: boolean;
  cellId: string | null | undefined;
  cellActive: boolean;
  leadershipStatus: string | null | undefined;
}): { ok: boolean; gaps: string[] } {
  const gaps: string[] = [];
  if (!params.hasActivatePermission) {
    gaps.push("Sin permiso leaders.activate.");
  }
  if (!params.cellId) gaps.push("Falta célula real.");
  if (params.cellId && !params.cellActive) gaps.push("La célula no está activa.");
  if (params.leadershipStatus !== "active") {
    gaps.push("Requiere personLeadership.status = active (autorización pastoral).");
  }
  return { ok: gaps.length === 0, gaps };
}
