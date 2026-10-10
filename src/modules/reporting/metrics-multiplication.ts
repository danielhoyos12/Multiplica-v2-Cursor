/**
 * Hierarchical multiplication metrics — unique persons/cells, no double-count
 * across generations.
 */

export type MultiplicationReportRow = {
  studentPersonId: string;
  fullName: string;
  ministryId: string;
  networkId: string | null;
  generationDepth: number | null;
  contactsListed: number;
  wonLinked: number;
  teamSize: number;
  firstSix: number;
  activeLeadersWithCell: number;
  teamComplete: boolean;
};

export type MultiplicationReportFilters = {
  ministryId?: string | null;
  networkId?: string | null;
  leaderPersonId?: string | null;
  generationDepth?: number | null;
  academicLevel?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
};

export type MultiplicationAggregates = {
  /** Unique student expedientes in scope */
  students: number;
  /** Unique disciple person ids across teams (deduped) */
  uniqueDisciples: number;
  /** Unique active leader person ids with cell */
  uniqueActiveLeaders: number;
  withLista15: number;
  withGanados3: number;
  withTeam6: number;
  withTeam12: number;
  withSixActiveLeaders: number;
};

export function aggregateMultiplication(
  rows: MultiplicationReportRow[],
  discipleSets: Map<string, Set<string>>,
  activeLeaderSets: Map<string, Set<string>>,
): MultiplicationAggregates {
  const allDisciples = new Set<string>();
  const allLeaders = new Set<string>();
  for (const set of discipleSets.values()) {
    for (const id of set) allDisciples.add(id);
  }
  for (const set of activeLeaderSets.values()) {
    for (const id of set) allLeaders.add(id);
  }

  return {
    students: rows.length,
    uniqueDisciples: allDisciples.size,
    uniqueActiveLeaders: allLeaders.size,
    withLista15: rows.filter((r) => r.contactsListed >= 15).length,
    withGanados3: rows.filter((r) => r.wonLinked >= 3).length,
    withTeam6: rows.filter((r) => r.teamSize >= 6).length,
    withTeam12: rows.filter((r) => r.teamComplete || r.teamSize >= 12).length,
    withSixActiveLeaders: rows.filter((r) => r.activeLeadersWithCell >= 6).length,
  };
}

/** Own / descendants / consolidated — depths from closure; null = own-only unknown. */
export function splitByLine(
  rows: MultiplicationReportRow[],
  rootPersonId: string | null,
): {
  own: MultiplicationReportRow[];
  descendants: MultiplicationReportRow[];
  consolidated: MultiplicationReportRow[];
} {
  if (!rootPersonId) {
    return { own: [], descendants: rows, consolidated: rows };
  }
  const own = rows.filter((r) => r.studentPersonId === rootPersonId);
  const descendants = rows.filter(
    (r) => r.studentPersonId !== rootPersonId && (r.generationDepth ?? 0) > 0,
  );
  // Consolidated = unique by studentPersonId across own+descendants
  const byId = new Map<string, MultiplicationReportRow>();
  for (const r of [...own, ...descendants]) byId.set(r.studentPersonId, r);
  return { own, descendants, consolidated: [...byId.values()] };
}

export function filterMultiplicationRows(
  rows: MultiplicationReportRow[],
  filters: MultiplicationReportFilters,
): MultiplicationReportRow[] {
  return rows.filter((r) => {
    if (filters.ministryId && r.ministryId !== filters.ministryId) return false;
    if (filters.networkId && r.networkId !== filters.networkId) return false;
    if (
      filters.generationDepth != null &&
      (r.generationDepth ?? -1) !== filters.generationDepth
    ) {
      return false;
    }
    return true;
  });
}
