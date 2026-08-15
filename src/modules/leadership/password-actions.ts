"use server";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { isDomainError } from "@/lib/errors";
import { requireSessionUser } from "@/server/auth";

export async function clearMustChangePasswordAction() {
  try {
    const user = await requireSessionUser();
    const db = getDb();
    await db
      .update(users)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return { ok: true as const };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false as const, error: error.message };
    }
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Error al actualizar perfil.",
    };
  }
}
