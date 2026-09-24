import { requireSessionUser, getSessionUser } from "@/server/auth";
import { loadAuthContext } from "@/modules/authorization";
import { DomainError, DomainErrorCode } from "@/lib/errors";

export async function requireAppActor() {
  const session = await requireSessionUser();
  if (!session.email) {
    throw new DomainError(
      DomainErrorCode.CONFIGURATION_ERROR,
      "La sesión no incluye correo electrónico.",
    );
  }

  const auth = await loadAuthContext(session.id);
  return { session, auth };
}

export async function getOptionalAppActor() {
  const session = await getSessionUser();
  if (!session?.email) {
    return null;
  }
  const auth = await loadAuthContext(session.id);
  return { session, auth };
}
