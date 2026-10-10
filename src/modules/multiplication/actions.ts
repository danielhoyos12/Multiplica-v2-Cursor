"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isDomainError } from "@/lib/errors";
import { requireSessionUser } from "@/server/auth";

import {
  assignTeamDisciple,
  linkWonContact,
  openOrGetExpediente,
  seedDefaultMilestones,
  upsertContactSlot,
} from "./service";

function toActionError(error: unknown): { ok: false; error: string; code?: string } {
  if (isDomainError(error)) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "No se pudo completar la operación." };
}

function revalidateMultiplication(personId?: string) {
  revalidatePath("/discipular/multiplicacion");
  revalidatePath("/enviar/multiplicacion");
  if (personId) {
    revalidatePath(`/discipular/multiplicacion/${personId}`);
    revalidatePath(`/ganar/${personId}`);
  }
}

export async function openExpedienteAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = z
      .object({
        studentPersonId: z.string().min(1),
        openedAtAcademicLevel: z.string().optional(),
      })
      .safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const expediente = await openOrGetExpediente(
      user.id,
      parsed.data.studentPersonId,
      parsed.data.openedAtAcademicLevel,
    );
    await seedDefaultMilestones(user.id, expediente.id);
    revalidateMultiplication(parsed.data.studentPersonId);
    return { ok: true as const, expedienteId: expediente.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function upsertContactAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = z
      .object({
        expedienteId: z.string().min(1),
        orderIndex: z.number().int().min(1).max(15),
        fullName: z.string().trim().min(2).max(160),
        phone: z.string().optional(),
        notes: z.string().optional(),
        studentPersonId: z.string().optional(),
      })
      .safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await upsertContactSlot(user.id, parsed.data);
    revalidateMultiplication(parsed.data.studentPersonId);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkWonContactAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = z
      .object({
        contactId: z.string().min(1),
        linkedPersonId: z.string().min(1),
        studentPersonId: z.string().optional(),
      })
      .safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await linkWonContact(user.id, parsed.data.contactId, parsed.data.linkedPersonId);
    revalidateMultiplication(parsed.data.studentPersonId);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignDiscipleAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = z
      .object({
        expedienteId: z.string().min(1),
        personId: z.string().min(1),
        slotIndex: z.number().int().min(1).max(12),
        cohort: z.enum(["first_six", "second_six"]),
        origin: z.enum(["won", "recovered", "assigned"]),
        studentPersonId: z.string().optional(),
      })
      .safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await assignTeamDisciple(user.id, parsed.data);
    revalidateMultiplication(parsed.data.studentPersonId);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}
