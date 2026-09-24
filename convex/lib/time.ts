/** Shared time helper — single source of truth for `createdAt`/`updatedAt` style fields. */

/** Current time in epoch milliseconds, matching the `v.number()` timestamp convention. */
export function now(): number {
  return Date.now();
}
