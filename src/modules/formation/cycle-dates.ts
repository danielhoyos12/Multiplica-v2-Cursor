/**
 * Pure date validation for training cycles (YYYY-MM-DD).
 * Keeps enrollment windows and class dates consistent with the cycle span.
 */

export type CycleClassDateInput = {
  moduleId: string;
  moduleCode?: string;
  moduleName?: string;
  sessionDate: string;
};

export type CycleDateInput = {
  startDate: string;
  endDate: string;
  enrollmentOpenDate?: string | null;
  enrollmentCloseDate?: string | null;
  classDates?: CycleClassDateInput[];
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string | null | undefined): value is string {
  return typeof value === "string" && DAY_RE.test(value);
}

/** Active enrollment statuses that count toward "en curso / inscritos". */
export const ACTIVE_ENROLLMENT_STATUSES = [
  "enrolled",
  "in_progress",
  "academic_completed",
] as const;

export type ActiveEnrollmentStatus = (typeof ACTIVE_ENROLLMENT_STATUSES)[number];

export function isActiveEnrollmentStatus(status: string): status is ActiveEnrollmentStatus {
  return (ACTIVE_ENROLLMENT_STATUSES as readonly string[]).includes(status);
}

/** Cycle statuses that still hold a vigente enrollment. */
export function isOpenCycleStatus(status: string): boolean {
  return status === "planned" || status === "active";
}

/**
 * Count unique persons with a real, current enrollment in open cycles.
 * Does not use process progress (apto / consolidar en curso).
 */
export function countUniqueActiveEnrollments(
  rows: Array<{ personId: string; enrollmentStatus: string; cycleStatus: string }>,
): number {
  const people = new Set<string>();
  for (const row of rows) {
    if (!isOpenCycleStatus(row.cycleStatus)) continue;
    if (!isActiveEnrollmentStatus(row.enrollmentStatus)) continue;
    people.add(row.personId);
  }
  return people.size;
}

export function validateCycleDates(input: CycleDateInput): string[] {
  const gaps: string[] = [];
  if (!isIsoDay(input.startDate)) gaps.push("Fecha de inicio inválida.");
  if (!isIsoDay(input.endDate)) gaps.push("Fecha de finalización inválida.");
  if (gaps.length) return gaps;

  if (input.startDate > input.endDate) {
    gaps.push("La fecha de inicio no puede ser posterior a la de finalización.");
  }

  const open = input.enrollmentOpenDate?.trim() || null;
  const close = input.enrollmentCloseDate?.trim() || null;

  if (open && !isIsoDay(open)) gaps.push("Fecha de apertura de inscripciones inválida.");
  if (close && !isIsoDay(close)) gaps.push("Fecha de cierre de inscripciones inválida.");

  if (open && close && open > close) {
    gaps.push("La apertura de inscripciones no puede ser posterior al cierre.");
  }
  if (open && open > input.endDate) {
    gaps.push("Las inscripciones no pueden abrirse después del fin del ciclo.");
  }
  if (close && close > input.endDate) {
    gaps.push("El cierre de inscripciones no puede ser posterior al fin del ciclo.");
  }
  if (close && close < input.startDate && open && open > close) {
    // already covered; keep for clarity
  }
  // Enrollment may open before the cycle starts; close should not precede open.
  // Closing after start is allowed (late enrollment), but not after end (above).

  const seenModules = new Set<string>();
  for (const row of input.classDates ?? []) {
    const label = row.moduleName || row.moduleCode || row.moduleId;
    if (!row.moduleId) {
      gaps.push(`Clase sin módulo: ${label}.`);
      continue;
    }
    if (seenModules.has(row.moduleId)) {
      gaps.push(`Fecha duplicada para la clase ${label}.`);
    }
    seenModules.add(row.moduleId);
    if (!isIsoDay(row.sessionDate)) {
      gaps.push(`Fecha de clase inválida (${label}).`);
      continue;
    }
    if (row.sessionDate < input.startDate || row.sessionDate > input.endDate) {
      gaps.push(
        `La fecha de ${label} (${row.sessionDate}) debe estar entre el inicio y el fin del ciclo.`,
      );
    }
  }

  return gaps;
}
