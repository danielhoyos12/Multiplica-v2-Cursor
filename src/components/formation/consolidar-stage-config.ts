import type { ConsolidarStage } from "@/modules/formation";

export type ConsolidarStageConfig = {
  stage: ConsolidarStage;
  slug: "pre" | "encuentro" | "post";
  href: string;
  title: string;
  eyebrow: string;
  description: string;
  approveLabel: string;
  nextHint: string;
  classHint: string;
};

export const CONSOLIDAR_STAGE_CONFIG: Record<
  "pre" | "encuentro" | "post",
  ConsolidarStageConfig
> = {
  pre: {
    stage: "pre_encuentro",
    slug: "pre",
    href: "/proceso/pre",
    title: "Pre-Encuentro",
    eyebrow: "02 Consolidar · UDLV 1",
    description:
      "Primera etapa de Universidad de la Vida. Personas aptas desde Ganar (Iniciar Consolidar). Cuatro clases según catálogo oficial.",
    approveLabel: "Aprobar y habilitar Encuentro",
    nextHint: "Al aprobar, la persona queda apta para Encuentro (sin matrícula automática).",
    classHint: "4 clases requeridas en el catálogo oficial.",
  },
  encuentro: {
    stage: "encuentro",
    slug: "encuentro",
    href: "/proceso/encuentro",
    title: "Encuentro",
    eyebrow: "02 Consolidar · UDLV 2",
    description:
      "Segunda etapa de Universidad de la Vida. Recibe automáticamente a quienes aprobaron Pre-Encuentro. La duración del evento sigue la configuración del ciclo.",
    approveLabel: "Aprobar y habilitar Post-Encuentro",
    nextHint: "Al aprobar, la persona queda apta para Post-Encuentro (sin matrícula automática).",
    classHint: "Jornadas del Encuentro según módulos del ciclo (no asumir duración fija).",
  },
  post: {
    stage: "post_encuentro",
    slug: "post",
    href: "/proceso/post",
    title: "Post-Encuentro",
    eyebrow: "02 Consolidar · UDLV 3",
    description:
      "Cierre de Universidad de la Vida. Recibe a quienes aprobaron Encuentro. Cuatro clases. Solo al completar se habilita CD1 en Discipular.",
    approveLabel: "Finalizar UDLV y habilitar CD1",
    nextHint: "Al aprobar, se sincroniza Consolidar completado y la persona queda apta para Capacitación Destino 1.",
    classHint: "4 clases requeridas en el catálogo oficial.",
  },
};

export function stageFromSlug(slug: string): ConsolidarStageConfig | null {
  if (slug === "pre" || slug === "encuentro" || slug === "post") {
    return CONSOLIDAR_STAGE_CONFIG[slug];
  }
  return null;
}
