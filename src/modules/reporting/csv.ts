/**
 * CSV helpers — formula injection sanitization + UTF-8 BOM.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Prevent formula injection
  if (/^[=+\-@]/.test(s) || s.startsWith("\t") || s.startsWith("\r")) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>,
): string {
  const lines = [
    headers.map(sanitizeCsvCell).join(","),
    ...rows.map((row) =>
      headers.map((h) => sanitizeCsvCell(row[h])).join(","),
    ),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

/** Ensure sensitive keys never appear in export payloads */
export function stripSensitiveFields<T extends Record<string, unknown>>(
  row: T,
): Omit<T, "prayerRequest" | "prayer_request" | "temporaryPassword" | "password"> {
  const clone = { ...row };
  delete (clone as Record<string, unknown>).prayerRequest;
  delete (clone as Record<string, unknown>).prayer_request;
  delete (clone as Record<string, unknown>).temporaryPassword;
  delete (clone as Record<string, unknown>).password;
  return clone;
}
