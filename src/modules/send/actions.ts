"use server";

import { revalidatePath } from "next/cache";

import { DomainError, isDomainError } from "@/lib/errors";
import { requireAppActor } from "@/server/actor";

import {
  anointAfterSend,
  anointAfterSendInputSchema,
  completeSend,
  completeSendInputSchema,
  startSend,
  startSendInputSchema,
} from "./service";

function fail(error: unknown) {
  if (isDomainError(error)) {
    return { ok: false as const, error: error.message, code: error.code };
  }
  console.error(error);
  return { ok: false as const, error: "Error inesperado.", code: "UNKNOWN" };
}

export async function startSendAction(raw: unknown) {
  try {
    const { session } = await requireAppActor();
    const parsed = startSendInputSchema.safeParse(raw);
    if (!parsed.success) return { ok: false as const, error: "Datos inválidos.", code: "VALIDATION" };
    const row = await startSend(session.id, parsed.data);
    revalidatePath("/enviar");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return { ok: true as const, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function completeSendAction(raw: unknown) {
  try {
    const { session } = await requireAppActor();
    const parsed = completeSendInputSchema.safeParse(raw);
    if (!parsed.success) return { ok: false as const, error: "Datos inválidos.", code: "VALIDATION" };
    const result = await completeSend(session.id, parsed.data);
    revalidatePath("/enviar");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    revalidatePath("/liderazgo");
    return {
      ok: true as const,
      leadershipEligible: result.leadershipEligible,
      leadershipActivated: result.leadershipActivated,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function anointAfterSendAction(raw: unknown) {
  try {
    const { session } = await requireAppActor();
    const parsed = anointAfterSendInputSchema.safeParse(raw);
    if (!parsed.success) return { ok: false as const, error: "Datos inválidos.", code: "VALIDATION" };
    const result = await anointAfterSend(session.id, parsed.data);
    revalidatePath("/enviar");
    revalidatePath(`/ganar/${parsed.data.personId}`);
    return { ok: true as const, status: result.status, isActive: result.isActive };
  } catch (e) {
    return fail(e);
  }
}

void DomainError;
