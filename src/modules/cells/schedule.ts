import type { z } from "zod";

import type { dayOfWeekSchema } from "./validation";

export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

export function formatDayOfWeek(day: DayOfWeek): string {
  return DAY_LABELS[day] ?? day;
}

/** Accepts HH:MM or HH:MM:SS → "7:30 PM" */
export function formatStartTime(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  const hours = Number(hRaw);
  const minutes = Number(mRaw ?? 0);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatCellSchedule(day: DayOfWeek, time: string): string {
  return `${formatDayOfWeek(day)} · ${formatStartTime(time)}`;
}

export function cellTypeLabel(type: "evangelistic" | "twelve"): string {
  return type === "twelve" ? "Célula de 12" : "Célula Evangelística";
}

export function cellStatusLabel(status: "active" | "inactive" | "closed"): string {
  if (status === "active") return "Activa";
  if (status === "inactive") return "Inactiva";
  return "Cerrada";
}
