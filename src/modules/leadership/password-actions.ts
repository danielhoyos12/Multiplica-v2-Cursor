"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
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

export async function clearMustChangePasswordAction() {
  try {
    const user = await requireSessionUser();
    const db = getDb();
    await db
      .update(users)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    if (process.env.CLERK_SECRET_KEY) {
      try {
        const client = await clerkClient();
        await client.users.updateUser(user.clerkUserId, {
          publicMetadata: { mustChangePassword: false },
        });
      } catch {
        // DB flag is source of truth for the app gate
      }
    }

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

export async function setNewPasswordAction(password: string) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { ok: false as const, error: "Debes iniciar sesión." };
    }
    if (password.length < 10) {
      return {
        ok: false as const,
        error: "La contraseña debe tener al menos 10 caracteres.",
      };
    }

    const client = await clerkClient();
    await client.users.updateUser(userId, {
      password,
      publicMetadata: { mustChangePassword: false },
    });

    return clearMustChangePasswordAction();
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la contraseña.",
    };
  }
}
