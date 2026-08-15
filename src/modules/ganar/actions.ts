"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { isDomainError } from "@/lib/errors";
import { requireSessionUser } from "@/server/auth";

import {
  createPersonInternal,
  createPersonPublic,
  getMinistryNetworkMaps,
  listCatalogsForGanar,
  listPersonsForActor,
  getPersonForActor,
  resolvePublicFormContext,
  updatePersonForActor,
  type PersonListFilters,
} from "./service";
import { ganarPersonInputSchema, publicGanarInputSchema } from "./validation";

function toActionError(error: unknown): { ok: false; error: string; code?: string } {
  if (isDomainError(error)) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "No se pudo completar la operación." };
}

async function clientMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || null;
  const userAgent = h.get("user-agent")?.slice(0, 400) ?? null;
  return { ip, userAgent };
}

export async function createPersonInternalAction(raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = ganarPersonInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      };
    }

    const result = await createPersonInternal(user.id, parsed.data);
    if (result.duplicates && result.duplicates.length > 0 && !parsed.data.forceCreate) {
      return {
        ok: false as const,
        error:
          result.duplicates[0]?.strength === "strong"
            ? "Ya existe una persona con este teléfono en tu alcance."
            : "Posible persona duplicada. Revisa antes de forzar el alta.",
        duplicates: result.duplicates,
        existingPersonId: result.personId || result.duplicates[0]?.personId,
      };
    }

    revalidatePath("/ganar");
    return { ok: true as const, personId: result.personId };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePersonAction(personId: string, raw: unknown) {
  try {
    const user = await requireSessionUser();
    const parsed = ganarPersonInputSchema
      .pick({
        fullName: true,
        phone: true,
        address: true,
        districtId: true,
        prayerRequest: true,
        email: true,
      })
      .partial()
      .safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      };
    }
    await updatePersonForActor(user.id, personId, parsed.data);
    revalidatePath("/ganar");
    revalidatePath(`/ganar/${personId}`);
    return { ok: true as const, personId };
  } catch (error) {
    return toActionError(error);
  }
}

export async function submitPublicPersonAction(raw: unknown) {
  try {
    // Honeypot: bots that fill hidden fields get a neutral success.
    if (
      raw &&
      typeof raw === "object" &&
      "website" in raw &&
      String((raw as { website?: string }).website ?? "").trim() !== ""
    ) {
      return { ok: true as const };
    }

    const parsed = publicGanarInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      };
    }

    const meta = await clientMeta();
    await createPersonPublic(parsed.data, meta);
    return { ok: true as const };
  } catch {
    // Never leak internal details on the public boundary.
    return { ok: false as const, error: "No se pudo enviar el registro. Intenta de nuevo." };
  }
}

export async function loadInternalCatalogsAction() {
  const user = await requireSessionUser();
  return listCatalogsForGanar(user.id);
}

export async function loadPublicCatalogsAction(params?: {
  ministry?: string | null;
  network?: string | null;
}) {
  const context = await resolvePublicFormContext({
    ministry: params?.ministry,
    network: params?.network,
  });
  const catalogs = await listCatalogsForGanar(null, {
    publicMode: true,
    ministryId: context.ministryId ?? undefined,
    networkId: context.networkId ?? undefined,
  });
  return { ...catalogs, context };
}

export async function listPersonsAction(filters: PersonListFilters) {
  const user = await requireSessionUser();
  return listPersonsForActor(user.id, filters);
}

export async function getPersonDetailAction(personId: string) {
  const user = await requireSessionUser();
  return getPersonForActor(user.id, personId);
}

export async function loadNameMapsAction() {
  return getMinistryNetworkMaps();
}
