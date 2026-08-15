/**
 * Username generation for activated leaders.
 * Strategy: first.last (ascii, lowercase); collision → first.last2, first.last3...
 * Username is unique and stable; unrelated to pastoral human codes.
 */

export function slugifyNamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

export function buildUsernameBase(firstName: string, lastName: string): string {
  const first = slugifyNamePart(firstName) || "lider";
  const last = slugifyNamePart(lastName.split(/\s+/)[0] ?? "") || "multiplica";
  return `${first}.${last}`.slice(0, 48);
}

export function nextUsernameCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  return `${base}${attempt}`.slice(0, 56);
}
