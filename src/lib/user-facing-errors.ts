/**
 * Domain error → Spanish user-facing message (never show raw codes as primary UX).
 */
import { DomainError, DomainErrorCode, isDomainError } from "@/lib/errors";

const MESSAGES: Partial<Record<DomainErrorCode, string>> = {
  [DomainErrorCode.NOT_AUTHORIZED]: "No tienes permiso para esta acción.",
  [DomainErrorCode.UNAUTHENTICATED]: "Debes iniciar sesión.",
  [DomainErrorCode.NOT_FOUND]: "No se encontró el recurso solicitado.",
  [DomainErrorCode.VALIDATION_FAILED]: "Los datos enviados no son válidos.",
  [DomainErrorCode.CONFLICT]: "La operación entra en conflicto con el estado actual.",
  [DomainErrorCode.LEADER_PARENT_CAPACITY_REACHED]:
    "Este líder ya tiene 12 líderes directos activos.",
  [DomainErrorCode.DIRECT_LEADER_CAPACITY_REACHED]:
    "Este líder ya tiene 12 líderes directos activos.",
  [DomainErrorCode.MAX_DIRECT_CELLS_REACHED]:
    "El responsable ya alcanzó el máximo de dos células directas.",
  [DomainErrorCode.LEADER_HAS_ACTIVE_STRUCTURE]:
    "No se puede desactivar: hay células o líderes directos. Usa un plan de desactivación.",
  [DomainErrorCode.LEADER_SUBTREE_CYCLE]:
    "Ese movimiento crearía un ciclo en el árbol de liderazgo.",
  [DomainErrorCode.SEND_NOT_ELIGIBLE]:
    "La persona aún no está apta para Enviar (requiere EM3 completada).",
  [DomainErrorCode.SEND_ALREADY_COMPLETED]: "Enviar ya está completado.",
  [DomainErrorCode.TRANSFER_ALREADY_EXECUTED]: "Esta transferencia ya fue ejecutada.",
  [DomainErrorCode.TRANSFER_NOT_APPROVED]: "La transferencia debe estar aprobada antes de ejecutar.",
  [DomainErrorCode.TREE_ACCESS_DENIED]: "No tienes acceso a esta estructura pastoral.",
  [DomainErrorCode.NETWORK_INCOMPATIBLE]: "La Red seleccionada no es compatible.",
  [DomainErrorCode.CELL_HAS_ACTIVE_MEMBERS]:
    "No se puede cerrar la célula mientras tenga miembros activos.",
  [DomainErrorCode.DASHBOARD_ACCESS_DENIED]: "Sin permiso para ver el dashboard.",
  [DomainErrorCode.REPORT_EXPORT_DENIED]: "Sin permiso para exportar reportes.",
  [DomainErrorCode.TWELVE_MEMBER_NOT_ACTIVE_LEADER]:
    "La célula de 12 solo admite líderes activos válidos.",
};

export function userFacingErrorMessage(error: unknown): string {
  if (isDomainError(error) || error instanceof DomainError) {
    const mapped = MESSAGES[error.code];
    if (mapped) return mapped;
    // Prefer domain message if already Spanish / human
    if (error.message && !/^[A-Z0-9_]+$/.test(error.message)) {
      return error.message;
    }
    return "No se pudo completar la operación.";
  }
  if (error instanceof Error && error.message) {
    // Never surface connection strings / SQL
    if (/postgres|DATABASE_URL|password|service.role/i.test(error.message)) {
      return "Ocurrió un error interno. Intenta de nuevo o contacta soporte.";
    }
  }
  return "Ocurrió un error inesperado.";
}
