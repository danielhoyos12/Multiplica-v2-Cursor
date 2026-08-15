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
  assignCycleStaffInputSchema,
  authorizeRecoveryInputSchema,
  completeConsolidationInputSchema,
  completeDestinoLevelInputSchema,
  completeUdvInputSchema,
  createCycleInputSchema,
  createDestinoCycleInputSchema,
  enrollDestinoInputSchema,
  enrollUdvInputSchema,
  markAcademicCompletedInputSchema,
  pauseProcessInputSchema,
  recordAttendanceInputSchema,
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
