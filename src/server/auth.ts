import { DomainError, DomainErrorCode } from "@/lib/errors";

import { createClient } from "./supabase/server";

export type SessionUser = {
  id: string;
  email: string | undefined;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new DomainError(
      DomainErrorCode.UNAUTHENTICATED,
      "Debes iniciar sesión para continuar.",
    );
  }
  return user;
}
