import { z } from "zod";

import { DomainError, DomainErrorCode } from "@/lib/errors";
import { canManageNetwork, type NetworkCode } from "@/modules/authorization";

export const ganarPersonInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Ingresa el nombre completo.")
    .max(160, "El nombre es demasiado largo."),
  phone: z
    .string()
    .trim()
    .min(7, "Ingresa un teléfono válido.")
    .max(32, "El teléfono es demasiado largo."),
  address: z
    .string()
    .trim()
    .min(3, "Ingresa la dirección.")
    .max(240, "La dirección es demasiado larga."),
  districtId: z.string().min(1, "Selecciona un distrito."),
  prayerRequest: z
    .string()
    .trim()
    .max(2000, "La petición de oración es demasiado larga.")
    .optional()
    .or(z.literal("")),
  ministryId: z.string().min(1, "Selecciona un ministerio."),
  networkId: z.string().min(1, "Selecciona una red."),
  email: z
    .string()
    .trim()
    .email("Correo inválido.")
    .max(160)
    .optional()
    .or(z.literal("")),
  forceCreate: z.boolean().optional().default(false),
});

export type GanarPersonInput = z.infer<typeof ganarPersonInputSchema>;

export const publicGanarInputSchema = ganarPersonInputSchema.omit({
  forceCreate: true,
  email: true,
});

export type PublicGanarInput = z.infer<typeof publicGanarInputSchema>;

export function assertNetworkAllowedForCapture(params: {
  networkCode: NetworkCode;
  networkIsActive: boolean;
}): void {
  if (!params.networkIsActive || params.networkCode === "ninos") {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      "La Red seleccionada no está disponible para captura.",
    );
  }
}

/** Actor with a managing network may only capture compatible target networks. */
export function assertActorMayCaptureNetwork(
  actorNetworkCodes: NetworkCode[],
  targetNetwork: NetworkCode,
): void {
  if (actorNetworkCodes.length === 0) {
    // Ministry-scoped actors without network assignment may capture any active non-Niños
    // network (validated elsewhere). Network-scoped actors must be compatible.
    return;
  }
  const ok = actorNetworkCodes.some((code) => canManageNetwork(code, targetNetwork));
  if (!ok) {
    throw new DomainError(
      DomainErrorCode.NETWORK_INCOMPATIBLE,
      "La Red no es compatible con el alcance del actor.",
    );
  }
}
