"use client";

import { useEffect } from "react";

/** Scroll/focus a Consolidar stage when ?etapa=pre|encuentro|post */
export function ProcesoEtapaFocus({ etapa }: { etapa: string | null }) {
  useEffect(() => {
    if (!etapa) return;
    const map: Record<string, string> = {
      pre: "pre-encuentro",
      encuentro: "encuentro",
      post: "post-encuentro",
    };
    const id = map[etapa];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.setAttribute("data-etapa-focus", "true");
    el.classList.add("ring-2", "ring-[var(--cobalt)]", "ring-offset-2");
    const t = window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-[var(--cobalt)]", "ring-offset-2");
    }, 2400);
    return () => window.clearTimeout(t);
  }, [etapa]);
  return null;
}
