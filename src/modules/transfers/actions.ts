"use server";

import { revalidatePath } from "next/cache";

import { isDomainError } from "@/lib/errors";
import { requireAppActor } from "@/server/actor";

import {
  approveTransfer,
  createTransferInputSchema,
  createTransferRequest,
  executePastoralTransfer,
  previewTransfer,
  rejectTransfer,
} from "./service";

function fail(error: unknown) {
  if (isDomainError(error)) {
    return { ok: false as const, error: error.message, code: error.code };
  }
  console.error(error);
  return { ok: false as const, error: "Error inesperado.", code: "UNKNOWN" };
}

export async function previewTransferAction(raw: unknown) {
  try {
    const { session } = await requireAppActor();
    const parsed = createTransferInputSchema.safeParse(raw);
    if (!parsed.success) return { ok: false as const, error: "Datos inválidos.", code: "VALIDATION" };
    const preview = await previewTransfer(session.id, parsed.data);
    return { ok: true as const, preview };
  } catch (e) {
    return fail(e);
  }
}

export async function createTransferAction(raw: unknown) {
  try {
    const { session } = await requireAppActor();
    const parsed = createTransferInputSchema.safeParse(raw);
    if (!parsed.success) return { ok: false as const, error: "Datos inválidos.", code: "VALIDATION" };
    const result = await createTransferRequest(session.id, parsed.data);
    revalidatePath("/transferencias");
    return { ok: true as const, id: result.request.id, status: result.request.status, preview: result.preview };
  } catch (e) {
    return fail(e);
  }
}

export async function approveTransferAction(requestId: string) {
  try {
    const { session } = await requireAppActor();
    const row = await approveTransfer(session.id, requestId);
    revalidatePath("/transferencias");
    return { ok: true as const, id: row.id, status: row.status };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectTransferAction(requestId: string, reason: string) {
  try {
    const { session } = await requireAppActor();
    const row = await rejectTransfer(session.id, requestId, reason);
    revalidatePath("/transferencias");
    return { ok: true as const, id: row.id, status: row.status };
  } catch (e) {
    return fail(e);
  }
}

export async function executeTransferAction(requestId: string) {
  try {
    const { session } = await requireAppActor();
    const row = await executePastoralTransfer(session.id, requestId);
    revalidatePath("/transferencias");
    revalidatePath("/liderazgo");
    revalidatePath(`/ganar/${row.personId}`);
    return { ok: true as const, id: row.id, status: row.status };
  } catch (e) {
    return fail(e);
  }
}
