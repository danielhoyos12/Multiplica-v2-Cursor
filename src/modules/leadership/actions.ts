"use server";

import { revalidatePath } from "next/cache";

import { isDomainError } from "@/lib/errors";
import { requireSessionUser } from "@/server/auth";

import {
  activateLeader,
  convertEvangelisticCellToTwelve,
  deactivateLeader,
  getBreadcrumbs,
  getLeaderDashboard,
  listDirectLeaders,
  markPersonEligible,
} from "./service";
import {
  activateLeaderInputSchema,
  convertTwelveInputSchema,
  markEligibleInputSchema,
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

export async function markEligibleAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = markEligibleInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await markPersonEligible(user.id, parsed.data);
    revalidatePath("/liderazgo");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function activateLeaderAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = activateLeaderInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const result = await activateLeader(user.id, parsed.data);
    revalidatePath("/liderazgo");
    revalidatePath(`/liderazgo/${parsed.data.personId}`);
    revalidatePath("/celulas");
    return {
      ok: true as const,
      cellId: result.cell.id,
      username: result.username,
      email: result.email,
      temporaryPassword: result.temporaryPassword,
      mustChangePassword: result.mustChangePassword,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deactivateLeaderAction(personId: string) {
  try {
    const user = await requireSessionUser();
    await deactivateLeader(user.id, personId);
    revalidatePath("/liderazgo");
    revalidatePath(`/liderazgo/${personId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function convertTwelveAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = convertTwelveInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const result = await convertEvangelisticCellToTwelve(user.id, parsed.data);
    revalidatePath(`/celulas/${parsed.data.cellId}`);
    revalidatePath("/liderazgo");
    return { ok: true as const, twelveCellId: result.twelve.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function loadLeaderDashboardAction(focusPersonId?: string) {
  const user = await requireSessionUser();
  return getLeaderDashboard(user.id, focusPersonId);
}

export async function loadDirectLeadersAction(leaderPersonId: string) {
  const user = await requireSessionUser();
  return listDirectLeaders(user.id, leaderPersonId);
}

export async function loadBreadcrumbsAction(personId: string) {
  const user = await requireSessionUser();
  return getBreadcrumbs(user.id, personId);
}
