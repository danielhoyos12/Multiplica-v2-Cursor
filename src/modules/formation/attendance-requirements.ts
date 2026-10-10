/**
 * Attendance / academic requirement evaluation for formation completion.
 *
 * Uses existing catalog modules (isRequired) and ConsolidarRules counts —
 * does not invent new pastoral thresholds. Pastoral cell-size gates that
 * official catalog deactivates are reported as UNDEFINED, not invented.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import {
  ENCUENTRO_CODE,
  POST_ENCUENTRO_CODE,
  PRE_ENCUENTRO_CODE,
} from "@/db/schema";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

export type ConsolidarStageForReq =
  | "pre_encuentro"
  | "encuentro"
  | "post_encuentro";

export type RequirementGap = {
  code: string;
  message: string;
};

export type AttendanceEval = {
  ok: boolean;
  gaps: RequirementGap[];
  presentOrRecovered: number;
  requiredModules: number;
  enrollmentId: string | null;
  cycleId: string | null;
};

const STAGE_PROGRAM: Record<ConsolidarStageForReq, string> = {
  pre_encuentro: PRE_ENCUENTRO_CODE,
  encuentro: ENCUENTRO_CODE,
  post_encuentro: POST_ENCUENTRO_CODE,
};

/** Mirrors ConsolidarRules — catalog session counts already in official catalog. */
const STAGE_MIN_PRESENT: Record<ConsolidarStageForReq, number> = {
  pre_encuentro: 4,
  encuentro: 3,
  post_encuentro: 4,
};

function countsAsAttended(status: string | undefined): boolean {
  return status === "present" || status === "recovered";
}

/**
 * Evaluate required-module attendance for a person in a program (by code).
 * Looks up the person's latest enrollment in cycles of that program via progress metadata.cycleId,
 * falling back to any active enrollment in the program.
 */
export async function evaluateProgramAttendance(
  personId: string,
  programCode: string,
  minPresent?: number,
): Promise<AttendanceEval> {
  const client = await getAuthenticatedConvexClient();
  const program = await client.query(api.formation.getProgramByCode, { code: programCode });
  if (!program) {
    return {
      ok: false,
      gaps: [
        {
          code: "PROGRAM_MISSING",
          message: `Programa ${programCode} no configurado en el catálogo.`,
        },
      ],
      presentOrRecovered: 0,
      requiredModules: 0,
      enrollmentId: null,
      cycleId: null,
    };
  }

  const modules = (
    await client.query(api.formation.listModules, {
      programId: program._id,
      activeOnly: true,
    })
  ).filter((m) => m.isRequired !== false);
  const requiredModules = modules.length;

  // Prefer cycle referenced on progress metadata for this process type if any.
  const progress = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: programCode as never,
  });
  const metaCycleId =
    progress && typeof progress.metadata === "object" && progress.metadata
      ? ((progress.metadata as { cycleId?: string }).cycleId ?? null)
      : null;

  let enrollmentId: string | null = null;
  let cycleId: string | null = metaCycleId;

  if (metaCycleId) {
    const enrollment = await client.query(api.formation.getEnrollmentByCycleAndPerson, {
      cycleId: metaCycleId as Id<"trainingCycles">,
      personId: personId as Id<"persons">,
    });
    if (enrollment) enrollmentId = enrollment._id as string;
  }

  if (!enrollmentId) {
    const cycles = await client.query(api.formation.listCycles, {
      programIds: [program._id],
    });
    for (const cycle of cycles) {
      const enrollment = await client.query(api.formation.getEnrollmentByCycleAndPerson, {
        cycleId: cycle._id,
        personId: personId as Id<"persons">,
      });
      if (enrollment) {
        enrollmentId = enrollment._id as string;
        cycleId = cycle._id as string;
        break;
      }
    }
  }

  if (!enrollmentId) {
    return {
      ok: false,
      gaps: [
        {
          code: "NOT_ENROLLED",
          message: "Debe estar inscrito en un ciclo activo de esta etapa antes de aprobar.",
        },
      ],
      presentOrRecovered: 0,
      requiredModules,
      enrollmentId: null,
      cycleId: null,
    };
  }

  const attendance = await client.query(api.formation.listAttendanceByEnrollments, {
    enrollmentIds: [enrollmentId as Id<"trainingEnrollments">],
  });
  const byModule = new Map(
    attendance.map((a) => [a.moduleId as string, a.status as string]),
  );

  let presentOrRecovered = 0;
  const missing: string[] = [];
  for (const mod of modules) {
    const status = byModule.get(mod._id as string);
    if (countsAsAttended(status)) {
      presentOrRecovered += 1;
    } else {
      missing.push(`${mod.code} (${mod.name})`);
    }
  }

  const threshold = minPresent ?? requiredModules;
  const gaps: RequirementGap[] = [];
  if (presentOrRecovered < threshold) {
    gaps.push({
      code: "ATTENDANCE_INCOMPLETE",
      message: `Asistencia insuficiente: ${presentOrRecovered}/${threshold} sesiones requeridas (presente o recuperada). Faltan: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "…" : ""}.`,
    });
  }

  return {
    ok: gaps.length === 0,
    gaps,
    presentOrRecovered,
    requiredModules,
    enrollmentId,
    cycleId,
  };
}

export async function assertConsolidarStageRequirements(
  personId: string,
  stage: ConsolidarStageForReq,
): Promise<AttendanceEval> {
  const client = await getAuthenticatedConvexClient();
  const progress = await client.query(api.formation.getProgress, {
    personId: personId as Id<"persons">,
    processType: stage,
  });
  if (!progress) {
    throw new DomainError(
      DomainErrorCode.PREREQUISITE_NOT_MET,
      "La persona no tiene progreso abierto en esta etapa.",
    );
  }
  if (progress.status === "completed") {
    throw new DomainError(
      DomainErrorCode.CONSOLIDATION_ALREADY_COMPLETED,
      "La etapa ya está aprobada.",
    );
  }
  if (progress.status === "eligible" || progress.status === "pending") {
    throw new DomainError(
      DomainErrorCode.PREREQUISITE_NOT_MET,
      "Debe inscribirse en un ciclo e iniciar asistencia antes de aprobar.",
    );
  }

  const evalResult = await evaluateProgramAttendance(
    personId,
    STAGE_PROGRAM[stage],
    STAGE_MIN_PRESENT[stage],
  );
  if (!evalResult.ok) {
    throw new DomainError(
      DomainErrorCode.PREREQUISITE_NOT_MET,
      evalResult.gaps.map((g) => g.message).join(" "),
      { gaps: evalResult.gaps },
    );
  }
  return evalResult;
}

export async function assertTrainingAttendanceRequirements(
  personId: string,
  programCode: string,
  opts?: { requireInProgress?: boolean; processType?: string },
): Promise<AttendanceEval> {
  if (opts?.processType) {
    const client = await getAuthenticatedConvexClient();
    const progress = await client.query(api.formation.getProgress, {
      personId: personId as Id<"persons">,
      processType: opts.processType as never,
    });
    if (!progress) {
      throw new DomainError(
        DomainErrorCode.PREREQUISITE_NOT_MET,
        "Sin progreso académico abierto.",
      );
    }
    if (opts.requireInProgress) {
      const okStatus =
        progress.status === "in_progress" ||
        progress.status === "academic_completed" ||
        progress.status === "paused";
      if (!okStatus) {
        throw new DomainError(
          DomainErrorCode.PREREQUISITE_NOT_MET,
          `Estado actual (${progress.status}) no permite avance académico. Debe estar inscrito/en curso.`,
        );
      }
    }
  }

  const evalResult = await evaluateProgramAttendance(personId, programCode);
  if (!evalResult.ok) {
    throw new DomainError(
      DomainErrorCode.PREREQUISITE_NOT_MET,
      evalResult.gaps.map((g) => g.message).join(" "),
      { gaps: evalResult.gaps },
    );
  }
  return evalResult;
}

/** Pure helper for tests — counts attended required modules. */
export function countAttendedRequired(
  requiredModuleIds: string[],
  attendanceByModule: Record<string, string | undefined>,
): { presentOrRecovered: number; missing: string[] } {
  const missing: string[] = [];
  let presentOrRecovered = 0;
  for (const id of requiredModuleIds) {
    if (countsAsAttended(attendanceByModule[id])) presentOrRecovered += 1;
    else missing.push(id);
  }
  return { presentOrRecovered, missing };
}

export function canApproveWithAttendance(params: {
  presentOrRecovered: number;
  requiredCount: number;
  enrolled: boolean;
  status: string;
}): { ok: boolean; gaps: string[] } {
  const gaps: string[] = [];
  if (!params.enrolled) gaps.push("Sin inscripción en ciclo.");
  if (params.status === "eligible" || params.status === "pending") {
    gaps.push("Debe estar en curso (inscrito) antes de aprobar.");
  }
  if (params.presentOrRecovered < params.requiredCount) {
    gaps.push(
      `Asistencia ${params.presentOrRecovered}/${params.requiredCount} insuficiente.`,
    );
  }
  return { ok: gaps.length === 0, gaps };
}
