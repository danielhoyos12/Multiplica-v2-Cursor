/**
 * Pastoral period helpers — America/Lima as default display context.
 * Persistence remains timestamptz; filters convert to UTC bounds.
 */
export type PeriodKey =
  | "this_week"
  | "this_month"
  | "last_30"
  | "last_90"
  | "this_year"
  | "custom";

export type PeriodRange = {
  key: PeriodKey;
  from: Date;
  to: Date;
  label: string;
  /** Previous equal-length window for comparisons */
  prevFrom: Date;
  prevTo: Date;
};

const LIMA_OFFSET_HOURS = -5; // America/Lima (no DST)

function limaNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utc + LIMA_OFFSET_HOURS * 3_600_000);
}

function startOfDayLima(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return toUtcFromLimaWall(x);
}

function endOfDayLima(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return toUtcFromLimaWall(x);
}

/** Convert a wall-clock Lima date to approximate UTC instant */
function toUtcFromLimaWall(limaWall: Date) {
  return new Date(limaWall.getTime() - LIMA_OFFSET_HOURS * 3_600_000);
}

export function resolvePeriod(
  key: PeriodKey = "this_month",
  custom?: { from?: string; to?: string },
): PeriodRange {
  const now = limaNow();
  let from: Date;
  let to = endOfDayLima(now);
  let label: string;
  let days = 30;

  switch (key) {
    case "this_week": {
      const day = now.getDay(); // 0 Sun
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      from = startOfDayLima(monday);
      label = "Esta semana";
      days = 7;
      break;
    }
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      from = startOfDayLima(first);
      label = "Este mes";
      days = Math.max(1, now.getDate());
      break;
    }
    case "last_30": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      from = startOfDayLima(d);
      label = "Últimos 30 días";
      days = 30;
      break;
    }
    case "last_90": {
      const d = new Date(now);
      d.setDate(d.getDate() - 89);
      from = startOfDayLima(d);
      label = "Últimos 90 días";
      days = 90;
      break;
    }
    case "this_year": {
      const first = new Date(now.getFullYear(), 0, 1);
      from = startOfDayLima(first);
      label = "Este año";
      days = Math.max(
        1,
        Math.ceil((to.getTime() - from.getTime()) / 86_400_000),
      );
      break;
    }
    case "custom": {
      if (!custom?.from || !custom?.to) {
        return resolvePeriod("this_month");
      }
      from = startOfDayLima(new Date(custom.from));
      to = endOfDayLima(new Date(custom.to));
      label = "Rango personalizado";
      days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
      break;
    }
    default:
      return resolvePeriod("this_month");
  }

  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - days * 86_400_000);

  return { key, from, to, label, prevFrom, prevTo };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function formatPctChange(current: number, previous: number): string {
  const p = pctChange(current, previous);
  if (p === null) return "N/A";
  if (p === 0) return "0%";
  return `${p > 0 ? "+" : ""}${p}%`;
}

/** Configurable thresholds (documented defaults) */
export const ReportingThresholds = {
  /** Days without process event → formation_stalled */
  formationStalledDays: 30,
  /** Days eligible without activation → eligible_not_activated */
  eligibleNotActivatedDays: 14,
  /** Attendance drop: recent avg < ratio * prior avg */
  attendanceDropRatio: 0.7,
  /** Sessions window for recent avg */
  attendanceRecentSessions: 2,
  /** Sessions window for baseline avg */
  attendanceBaselineSessions: 4,
  /** Hours after scheduled cell day before no_recent_attendance fires */
  cellReportGraceHours: 36,
  maxDirectLeaders: 12,
  maxDirectCells: 2,
} as const;
