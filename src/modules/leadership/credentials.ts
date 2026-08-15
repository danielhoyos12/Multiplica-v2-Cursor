import { createHash, randomBytes } from "node:crypto";

/** Temporary password — never persist in app tables or audit logs. */
export function generateTemporaryPassword(): string {
  const raw = randomBytes(18).toString("base64url");
  return `Tmp.${raw.slice(0, 14)}!9a`;
}

export function hashForLogFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
