import { ConvexError } from "convex/values";

import { DomainError, DomainErrorCode } from "@/lib/errors";

/**
 * Convex functions throw `ConvexError<{ code, message }>` (see
 * `convex/lib/errors.ts`). `ConvexHttpClient` forwards `.data` onto the
 * thrown `ConvexError` — map that back onto our `DomainError` so callers
 * (server actions, RSC pages) keep working with the same error contract
 * they used against the Drizzle/Postgres data plane.
 */
const CODE_MAP: Record<string, DomainErrorCode> = {
  NOT_FOUND: DomainErrorCode.NOT_FOUND,
  ALREADY_EXISTS: DomainErrorCode.CONFLICT,
  CONFLICT: DomainErrorCode.CONFLICT,
  INVALID_ARGUMENT: DomainErrorCode.VALIDATION_FAILED,
  UNAUTHENTICATED: DomainErrorCode.UNAUTHENTICATED,
  FORBIDDEN: DomainErrorCode.NOT_AUTHORIZED,
  INTERNAL: DomainErrorCode.CONFIGURATION_ERROR,
};

/** Rethrows Convex errors as `DomainError`; passes through everything else. */
export function mapConvexError(error: unknown): never {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; message?: string } | undefined;
    const code =
      (data?.code && CODE_MAP[data.code]) || DomainErrorCode.CONFIGURATION_ERROR;
    throw new DomainError(code, data?.message ?? error.message);
  }
  throw error;
}
