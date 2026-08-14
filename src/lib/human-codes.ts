/**
 * Human-readable hierarchical codes (e.g. LP1, LP1-01, LP1-03-01).
 * These are NEVER primary keys — only display / pastoral navigation aids.
 * Full leadership tree generation lands in a later phase; this service is
 * the reusable formatter/parser architecture for that work.
 */

const SEGMENT_PATTERN = /^[A-Za-z0-9]+$/;

export function parseHumanCode(code: string): string[] {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error("Human code cannot be empty.");
  }
  const parts = trimmed.split("-").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !SEGMENT_PATTERN.test(part))) {
    throw new Error(`Invalid human code: ${code}`);
  }
  return parts;
}

export function formatHumanCode(parts: string[]): string {
  if (parts.length === 0) {
    throw new Error("Human code requires at least one segment.");
  }
  for (const part of parts) {
    if (!SEGMENT_PATTERN.test(part)) {
      throw new Error(`Invalid human code segment: ${part}`);
    }
  }
  return parts.join("-");
}

/** Root ministry-style code, e.g. LP1 */
export function buildRootHumanCode(prefix: string, index: number): string {
  if (!SEGMENT_PATTERN.test(prefix)) {
    throw new Error(`Invalid human code prefix: ${prefix}`);
  }
  if (!Number.isInteger(index) || index < 1) {
    throw new Error("Human code index must be a positive integer.");
  }
  return `${prefix}${index}`;
}

/** Child segment under a parent, zero-padded to 2 digits by default. */
export function buildChildHumanCode(
  parentCode: string,
  childIndex: number,
  pad = 2,
): string {
  if (!Number.isInteger(childIndex) || childIndex < 1) {
    throw new Error("Child index must be a positive integer.");
  }
  const segment = String(childIndex).padStart(pad, "0");
  return formatHumanCode([...parseHumanCode(parentCode), segment]);
}

export function isValidHumanCode(code: string): boolean {
  try {
    parseHumanCode(code);
    return true;
  } catch {
    return false;
  }
}
