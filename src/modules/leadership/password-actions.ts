"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { isDomainError } from "@/lib/errors";
import {
  MUST_CHANGE_PASSWORD_COOKIE,
  passwordGateCookieOptions,
} from "@/lib/password-change-gate";
import { requireSessionUser } from "@/server/auth";
import { createClient } from "@/server/supabase/server";

export async function clearMustChangePasswordAction() {
  try {
    const user = await requireSessionUser();
    const db = getDb();
    await db
      .update(users)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const supabase = await createClient();
    await supabase.auth.updateUser({
      data: { must_change_password: false },
    });

    const cookieStore = await cookies();
    cookieStore.set(MUST_CHANGE_PASSWORD_COOKIE, "", {
      ...passwordGateCookieOptions(0),
      maxAge: 0,
    });

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
