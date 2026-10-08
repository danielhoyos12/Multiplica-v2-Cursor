import { OfficialEligibility } from "@/modules/formation/official-catalog";

export type ConsolidarStageStatus =
  | "pending"
  | "eligible"
  | "in_progress"
  | "academic_completed"
  | "completed"
  | "paused"
  | "abandoned"
  | string;

/**
 * Canonical Consolidar / UDLV ladder status.
 *
 * Consolidar = Universidad de la Vida (Pre-Encuentro → Encuentro → Post-Encuentro).
 * Aggregate `personProcessProgress` rows with processType `consolidar` may be
 * stale (e.g. marked completed without stages). Display and gates MUST derive
 * from the three UDLV stages; a false aggregate "completed" becomes "in_progress".
 */
export function deriveConsolidarLadderStatus(params: {
  aggregateStatus: ConsolidarStageStatus | null | undefined;
  preStatus: ConsolidarStageStatus | null | undefined;
  encuentroStatus: ConsolidarStageStatus | null | undefined;
  postStatus: ConsolidarStageStatus | null | undefined;
}): { status: ConsolidarStageStatus; derivedComplete: boolean } {
  const pre = params.preStatus ?? "pending";
  const encuentro = params.encuentroStatus ?? "pending";
  const post = params.postStatus ?? "pending";
  const aggregate = params.aggregateStatus ?? "pending";

  const derivedComplete = OfficialEligibility.consolidar(pre, encuentro, post);
  if (derivedComplete) {
    return { status: "completed", derivedComplete: true };
  }

  const stageTouched = [pre, encuentro, post].some(
    (status) =>
      status === "eligible" ||
      status === "in_progress" ||
      status === "academic_completed" ||
      status === "completed" ||
      status === "paused",
  );

  if (aggregate === "paused") {
    return { status: "paused", derivedComplete: false };
  }

  // False completion (aggregate completed without UDLV) → En curso
  if (aggregate === "completed" || aggregate === "in_progress" || stageTouched) {
    return { status: "in_progress", derivedComplete: false };
  }

  if (aggregate === "eligible") {
    return { status: "eligible", derivedComplete: false };
  }

  return { status: "pending", derivedComplete: false };
}

/** True when Capacitación Destino (Discipular) may be offered as the next step. */
export function canOfferCapacitacionDestino(params: {
  aggregateStatus: ConsolidarStageStatus | null | undefined;
  preStatus: ConsolidarStageStatus | null | undefined;
  encuentroStatus: ConsolidarStageStatus | null | undefined;
  postStatus: ConsolidarStageStatus | null | undefined;
}): boolean {
  return deriveConsolidarLadderStatus(params).derivedComplete;
}

const OPEN_STAGE = new Set([
  "eligible",
  "in_progress",
  "academic_completed",
  "completed",
]);

/**
 * Whether an authorized repair should rewrite the Consolidar aggregate / Pre-Encuentro.
 * Idempotent: false when UDLV already complete or aggregate is already En curso without
 * stale completion stamps and Pre-Encuentro is open.
 */
export function needsConsolidarUdlvRepair(params: {
  derivedComplete: boolean;
  aggregateStatus: ConsolidarStageStatus | null | undefined;
  aggregateCompletedAt?: number | null;
  preStatus: ConsolidarStageStatus | null | undefined;
}): boolean {
  if (params.derivedComplete) return false;
  const aggregateOk =
    params.aggregateStatus === "in_progress" &&
    (params.aggregateCompletedAt === undefined ||
      params.aggregateCompletedAt === null);
  const preOk = OPEN_STAGE.has(params.preStatus ?? "pending");
  return !(aggregateOk && preOk);
}
