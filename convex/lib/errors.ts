import { ConvexError } from "convex/values";

/** Stable error codes surfaced to clients — keep in sync with UI error handling. */
export type ErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "INVALID_ARGUMENT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL";

export type PastoralErrorData = {
  code: ErrorCode;
  message: string;
  [key: string]: string;
};

/** Throw a structured, client-readable error (`error.data` = `{ code, message }`). */
export function throwPastoralError(code: ErrorCode, message: string): never {
  throw new ConvexError<PastoralErrorData>({ code, message });
}

export const notFound = (message: string): never => throwPastoralError("NOT_FOUND", message);
export const alreadyExists = (message: string): never =>
  throwPastoralError("ALREADY_EXISTS", message);
export const invalidArgument = (message: string): never =>
  throwPastoralError("INVALID_ARGUMENT", message);
export const unauthenticated = (message: string): never =>
  throwPastoralError("UNAUTHENTICATED", message);
export const forbidden = (message: string): never => throwPastoralError("FORBIDDEN", message);
export const conflict = (message: string): never => throwPastoralError("CONFLICT", message);
export const internal = (message: string): never => throwPastoralError("INTERNAL", message);
