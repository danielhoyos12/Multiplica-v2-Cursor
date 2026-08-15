/**
 * Phone / name helpers for GANAR Persona Maestra.
 */

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  // Keep last 9–15 digits for regional prefixes / country codes
  if (digits.length < 7) return digits;
  return digits;
}

export function phonesMatchStrong(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Compare last 9 digits when lengths differ (e.g. +51 prefix)
  const a9 = na.slice(-9);
  const b9 = nb.slice(-9);
  return a9.length >= 9 && a9 === b9;
}

export function normalizeNamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Split a full name into first/last for storage.
 * First token → firstName; remainder → lastName (or "." if single token).
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    throw new Error("El nombre es obligatorio.");
  }
  const parts = cleaned.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "." };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function formatFullName(firstName: string, lastName: string): string {
  if (!lastName || lastName === ".") return firstName;
  return `${firstName} ${lastName}`.trim();
}

export function namesLookSimilar(
  aFirst: string,
  aLast: string,
  bFirst: string,
  bLast: string,
): boolean {
  const a = `${normalizeNamePart(aFirst)} ${normalizeNamePart(aLast === "." ? "" : aLast)}`.trim();
  const b = `${normalizeNamePart(bFirst)} ${normalizeNamePart(bLast === "." ? "" : bLast)}`.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  // Simple containment for near-duplicates
  return a.includes(b) || b.includes(a);
}
