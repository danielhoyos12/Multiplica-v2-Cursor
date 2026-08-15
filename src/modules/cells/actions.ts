"use server";

import { revalidatePath } from "next/cache";

import { isDomainError } from "@/lib/errors";
import { requireSessionUser } from "@/server/auth";

import {
  addMemberToCell,
  closeCell,
  convertEvangelisticToTwelve,
  createCell,
  getAttendanceBoard,
  getCellDetail,
  listCatalogsForCells,
  listCellsForActor,
  reassignMember,
  removeMemberFromCell,
  saveCellAttendance,
  searchPersonsForCell,
  updateCell,
  type CellListFilters,
} from "./service";
import {
  createCellInputSchema,
  saveAttendanceInputSchema,
  updateCellInputSchema,
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

export async function createCellAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = createCellInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const cell = await createCell(user.id, parsed.data);
    revalidatePath("/celulas");
    return { ok: true as const, cellId: cell.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCellAction(cellId: string, raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = updateCellInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await updateCell(user.id, cellId, parsed.data);
    revalidatePath("/celulas");
    revalidatePath(`/celulas/${cellId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function closeCellAction(cellId: string) {
  try {
    const user = await requireSessionUser();
    await closeCell(user.id, cellId);
    revalidatePath("/celulas");
    revalidatePath(`/celulas/${cellId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function convertCellAction(cellId: string) {
  try {
    const user = await requireSessionUser();
    await convertEvangelisticToTwelve(user.id, cellId);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addMemberAction(cellId: string, personId: string) {
  try {
    const user = await requireSessionUser();
    await addMemberToCell(user.id, cellId, personId);
    revalidatePath(`/celulas/${cellId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeMemberAction(cellId: string, membershipId: string, reason?: string) {
  try {
    const user = await requireSessionUser();
    await removeMemberFromCell(user.id, membershipId, reason);
    revalidatePath(`/celulas/${cellId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function reassignMemberAction(
  cellId: string,
  membershipId: string,
  targetCellId: string,
  reason?: string,
) {
  try {
    const user = await requireSessionUser();
    await reassignMember(user.id, membershipId, targetCellId, reason);
    revalidatePath(`/celulas/${cellId}`);
    revalidatePath(`/celulas/${targetCellId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function searchPersonsForCellAction(cellId: string, q: string) {
  const user = await requireSessionUser();
  return searchPersonsForCell(user.id, cellId, q);
}

export async function saveAttendanceAction(cellId: string, raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = saveAttendanceInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const result = await saveCellAttendance(user.id, cellId, parsed.data);
    revalidatePath(`/celulas/${cellId}`);
    revalidatePath(`/celulas/${cellId}/asistencia`);
    return { ok: true as const, sessionId: result.sessionId };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listCellsAction(filters: CellListFilters) {
  const user = await requireSessionUser();
  return listCellsForActor(user.id, filters);
}

export async function getCellDetailAction(cellId: string) {
  const user = await requireSessionUser();
  return getCellDetail(user.id, cellId);
}

export async function getAttendanceBoardAction(cellId: string, sessionDate: string) {
  const user = await requireSessionUser();
  return getAttendanceBoard(user.id, cellId, sessionDate);
}

export async function loadCellCatalogsAction() {
  const user = await requireSessionUser();
  return listCatalogsForCells(user.id);
}
