import type { Id } from "../../../convex/_generated/dataModel";
import { mapConvexError } from "@/lib/convex-errors";
import { api, getConvexHttpClient } from "@/server/convex";

const SENSITIVE_KEY_PATTERN =
  /^(password|token|secret|authorization|api[_-]?key|service[_-]?role|prayer[_-]?request|peticion(_de_oracion)?)$/i;

export function sanitizeAuditPayload(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      sanitized[key] = sanitizeAuditPayload(entry as Record<string, unknown>);
      continue;
    }
    sanitized[key] = entry;
  }
  return sanitized;
}

export type WriteAuditLogInput = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
};

/** Writes an append-only audit row via `convex/audit.ts` `write`. */
export async function writeAuditLog(input: WriteAuditLogInput) {
  const client = getConvexHttpClient();

  await client
    .mutation(api.audit.write, {
      actorUserId: input.actorUserId ? (input.actorUserId as Id<"users">) : null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeData: sanitizeAuditPayload(input.beforeData),
      afterData: sanitizeAuditPayload(input.afterData),
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
      requestId: input.requestId ?? null,
    })
    .catch(mapConvexError);
}
