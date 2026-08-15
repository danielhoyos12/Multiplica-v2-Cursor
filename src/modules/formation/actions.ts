"use server";

import { revalidatePath } from "next/cache";

import { isDomainError } from "@/lib/errors";
import { requireSessionUser } from "@/server/auth";

import {
  activateTrainingCycle,
  authorizeAttendanceRecovery,
  closeTrainingCycle,
  completeConsolidation,
  completeUdv,
  createTrainingCycle,
  enrollInUdv,
  pauseProcess,
  recordTrainingAttendance,
  resumeProcess,
  startConsolidation,
} from "./service";
import {
  assignCycleStaff,
  completeDestinoLevel,
  createDestinoCycle,
  enrollDestino,
  markAcademicCompleted,
} from "./destination";
import {
  completeEm,
  createEmCycle,
  enrollEm,
  markEmAcademicCompleted,
  pauseEm,
  resumeEm,
} from "./ministerial";
import {
  completeReencuentro,
  createReencuentroEvent,
  enrollReencuentro,
  recordReencuentroAttendance,
} from "./reencounter";
import {
  assignCycleStaffInputSchema,
  authorizeRecoveryInputSchema,
  completeConsolidationInputSchema,
  completeDestinoLevelInputSchema,
  completeEmInputSchema,
  completeReencuentroInputSchema,
  completeUdvInputSchema,
  createCycleInputSchema,
  createDestinoCycleInputSchema,
  createEmCycleInputSchema,
  createReencuentroEventInputSchema,
  enrollDestinoInputSchema,
  enrollEmInputSchema,
  enrollReencuentroInputSchema,
  enrollUdvInputSchema,
  markAcademicCompletedInputSchema,
  markEmAcademicInputSchema,
  pauseProcessInputSchema,
  recordAttendanceInputSchema,
  recordReencuentroAttendanceInputSchema,
  resumeProcessInputSchema,
  startConsolidationInputSchema,
} from "./validation";

function toActionError(error: unknown): { ok: false; error: string; code?: string } {
  if (isDomainError(error)) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "No se pudo completar la operación." };
}

export async function startConsolidationAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = startConsolidationInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await startConsolidation(user.id, parsed.data);
    revalidatePath("/proceso");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeConsolidationAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = completeConsolidationInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await completeConsolidation(user.id, parsed.data);
    revalidatePath("/proceso");
    revalidatePath("/udv");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function pauseProcessAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = pauseProcessInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await pauseProcess(user.id, parsed.data);
    revalidatePath("/proceso");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resumeProcessAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = resumeProcessInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await resumeProcess(user.id, parsed.data);
    revalidatePath("/proceso");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createCycleAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = createCycleInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const cycle = await createTrainingCycle(user.id, parsed.data);
    revalidatePath("/udv");
    return { ok: true as const, cycleId: cycle.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function activateCycleAction(cycleId: string) {
  try {
    const user = await requireSessionUser();
    await activateTrainingCycle(user.id, cycleId);
    revalidatePath("/udv");
    revalidatePath(`/udv/${cycleId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function closeCycleAction(cycleId: string) {
  try {
    const user = await requireSessionUser();
    await closeTrainingCycle(user.id, cycleId);
    revalidatePath("/udv");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function enrollUdvAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = enrollUdvInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await enrollInUdv(user.id, parsed.data);
    revalidatePath("/udv");
    revalidatePath(`/udv/${parsed.data.cycleId}`);
    revalidatePath("/proceso");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function recordAttendanceAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = recordAttendanceInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await recordTrainingAttendance(user.id, parsed.data);
    revalidatePath("/udv");
    revalidatePath("/destino");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function authorizeRecoveryAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = authorizeRecoveryInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await authorizeAttendanceRecovery(user.id, parsed.data);
    revalidatePath("/udv");
    revalidatePath("/destino");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeUdvAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = completeUdvInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const result = await completeUdv(user.id, parsed.data);
    revalidatePath("/udv");
    revalidatePath("/proceso");
    revalidatePath("/destino");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return {
      ok: true as const,
      nextStageEligible: result.nextStageEligible,
      leadershipActivated: result.leadershipActivated,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createDestinoCycleAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = createDestinoCycleInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const cycle = await createDestinoCycle(user.id, {
      ...parsed.data,
      ministryId: parsed.data.ministryId || null,
    });
    revalidatePath("/destino");
    return { ok: true as const, cycleId: cycle.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function enrollDestinoAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = enrollDestinoInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await enrollDestino(user.id, parsed.data);
    revalidatePath("/destino");
    revalidatePath(`/destino/${parsed.data.cycleId}`);
    revalidatePath("/proceso");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function markAcademicCompletedAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = markAcademicCompletedInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await markAcademicCompleted(user.id, parsed.data);
    revalidatePath("/destino");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeDestinoLevelAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = completeDestinoLevelInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const result = await completeDestinoLevel(user.id, parsed.data);
    revalidatePath("/destino");
    revalidatePath("/proceso");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return {
      ok: true as const,
      nextEligible: result.nextEligible,
      leadershipActivated: result.leadershipActivated,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignCycleStaffAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = assignCycleStaffInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await assignCycleStaff(user.id, parsed.data);
    revalidatePath("/destino");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function activateDestinoCycleAction(cycleId: string) {
  try {
    const user = await requireSessionUser();
    await activateTrainingCycle(user.id, cycleId);
    revalidatePath("/destino");
    revalidatePath(`/destino/${cycleId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createEmCycleAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = createEmCycleInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const cycle = await createEmCycle(user.id, {
      ...parsed.data,
      ministryId: parsed.data.ministryId || null,
    });
    revalidatePath("/escuela-ministerial");
    return { ok: true as const, cycleId: cycle.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function activateEmCycleAction(cycleId: string) {
  try {
    const user = await requireSessionUser();
    await activateTrainingCycle(user.id, cycleId);
    revalidatePath("/escuela-ministerial");
    revalidatePath(`/escuela-ministerial/${cycleId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function enrollEmAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = enrollEmInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await enrollEm(user.id, parsed.data);
    revalidatePath("/escuela-ministerial");
    revalidatePath(`/escuela-ministerial/${parsed.data.cycleId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function markEmAcademicAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = markEmAcademicInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await markEmAcademicCompleted(user.id, parsed.data);
    revalidatePath("/escuela-ministerial");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeEmAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = completeEmInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const result = await completeEm(user.id, parsed.data);
    revalidatePath("/escuela-ministerial");
    revalidatePath("/reencuentro");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return {
      ok: true as const,
      nextStageEligible: result.nextStageEligible,
      leadershipActivated: result.leadershipActivated,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function pauseEmAction(personId: string, note?: string) {
  try {
    const user = await requireSessionUser();
    await pauseEm(user.id, personId, note);
    revalidatePath("/escuela-ministerial");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resumeEmAction(personId: string) {
  try {
    const user = await requireSessionUser();
    await resumeEm(user.id, personId);
    revalidatePath("/escuela-ministerial");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createReencuentroEventAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = createReencuentroEventInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const cycle = await createReencuentroEvent(user.id, {
      ...parsed.data,
      ministryId: parsed.data.ministryId || null,
    });
    revalidatePath("/reencuentro");
    return { ok: true as const, cycleId: cycle.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function activateReencuentroEventAction(cycleId: string) {
  try {
    const user = await requireSessionUser();
    await activateTrainingCycle(user.id, cycleId);
    revalidatePath("/reencuentro");
    revalidatePath(`/reencuentro/${cycleId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function enrollReencuentroAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = enrollReencuentroInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await enrollReencuentro(user.id, parsed.data);
    revalidatePath("/reencuentro");
    revalidatePath(`/reencuentro/${parsed.data.cycleId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function recordReencuentroAttendanceAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = recordReencuentroAttendanceInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await recordReencuentroAttendance(user.id, parsed.data);
    revalidatePath("/reencuentro");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeReencuentroAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = completeReencuentroInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const result = await completeReencuentro(user.id, parsed.data);
    revalidatePath("/reencuentro");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return {
      ok: true as const,
      nextStageEligible: result.nextStageEligible,
      eligibleForSend: result.eligibleForSend,
      leadershipActivated: result.leadershipActivated,
    };
  } catch (error) {
    return toActionError(error);
  }
}
