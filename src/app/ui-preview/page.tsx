import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";

export const metadata = { title: "UI Preview" };

/**
 * Visual harness for Neo Editorial shell (Phase 1 screenshots).
 * Enabled only with MULTIPLICA_UI_PREVIEW=1 — not a pastoral route.
 */
export default function UiPreviewPage() {
  const allowed =
    process.env.MULTIPLICA_UI_PREVIEW === "1" || process.env.NODE_ENV === "development";
  if (!allowed) {
    notFound();
  }

  return (
    <AppShell userEmail="preview@multiplica.local">
      <div className="space-y-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--ink)]">
          Neo Editorial — preview
        </h1>
        <p className="max-w-xl text-sm text-[var(--muted)]">
          Harness de navegación Phase 1. El contenido pastoral no cambia aquí.
        </p>
      </div>
    </AppShell>
  );
}
