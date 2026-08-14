export const DomainErrorCode = {
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  PREREQUISITE_NOT_MET: "PREREQUISITE_NOT_MET",
  NETWORK_INCOMPATIBLE: "NETWORK_INCOMPATIBLE",
  MAX_DIRECT_CELLS_REACHED: "MAX_DIRECT_CELLS_REACHED",
  CELL_CONVERSION_REQUIRES_MEMBER_RESOLUTION:
    "CELL_CONVERSION_REQUIRES_MEMBER_RESOLUTION",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
} as const;

export type DomainErrorCode = (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
