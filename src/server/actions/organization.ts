"use server";

import { revalidatePath } from "next/cache";

import { isDomainError } from "@/lib/errors";
import {
  assignMinistryResponsible,
  createMinistry,
  setMinistryActive,
  updateMinistry,
  ministryInputSchema,
} from "@/modules/organization";
import { requireSessionUser } from "@/server/auth";

function toActionError(error: unknown): { ok: false; error: string; code?: string } {
  if (isDomainError(error)) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Error inesperado." };
}

export async function createMinistryAction(formData: FormData) {
  try {
    const user = await requireSessionUser();
    const input = ministryInputSchema.parse({
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
    });
    await createMinistry(user.id, input);
    revalidatePath("/admin/ministries");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateMinistryAction(ministryId: string, formData: FormData) {
  try {
    const user = await requireSessionUser();
    const input = ministryInputSchema.parse({
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
    });
    await updateMinistry(user.id, ministryId, input);
    revalidatePath("/admin/ministries");
    revalidatePath(`/admin/ministries/${ministryId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleMinistryActiveAction(ministryId: string, isActive: boolean) {
  try {
    const user = await requireSessionUser();
    await setMinistryActive(user.id, ministryId, isActive);
    revalidatePath("/admin/ministries");
    revalidatePath(`/admin/ministries/${ministryId}`);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignResponsibleAction(ministryId: string, formData: FormData) {
  try {
    const user = await requireSessionUser();
    const raw = String(formData.get("responsibleUserId") ?? "");
    const responsibleUserId = raw.trim() === "" ? null : raw.trim();
    await assignMinistryResponsible(user.id, ministryId, responsibleUserId);
    revalidatePath("/admin/ministries");
    revalidatePath(`/admin/ministries/${ministryId}`);
    revalidatePath("/admin/users");
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}
