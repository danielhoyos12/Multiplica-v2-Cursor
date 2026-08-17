"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import type { Id } from "../../../convex/_generated/dataModel";
import { isDomainError } from "@/lib/errors";
import {
  MUST_CHANGE_PASSWORD_COOKIE,
  passwordGateCookieOptions,
} from "@/lib/password-change-gate";
import { requireSessionUser } from "@/server/auth";
import { api, getConvexHttpClient } from "@/server/convex";

export async function clearMustChangePasswordAction() {
  try {
    const user = await requireSessionUser();
    const client = getConvexHttpClient();
    await client.mutation(api.users.setMustChangePassword, {
      userId: user.id as Id<"users">,
      value: false,
    });

    if (process.env.CLERK_SECRET_KEY) {
      try {
        const clerk = await clerkClient();
        await clerk.users.updateUser(user.clerkUserId, {
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
    const user = await requireSessionUser();
    if (password.length < 10) {
      return {
        ok: false as const,
        error: "La contraseña debe tener al menos 10 caracteres.",
      };
    }

    const clerk = await clerkClient();
    await clerk.users.updateUser(user.clerkUserId, {
      password,
      publicMetadata: { mustChangePassword: false },
    });

    return clearMustChangePasswordAction();
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false as const, error: error.message };
    }
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la contraseña.",
    };
  }
}
