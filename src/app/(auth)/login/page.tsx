import { Suspense } from "react";

import { BrandMark } from "@/components/layout/brand-mark";
import { LoginForm } from "@/components/auth/login-form";
import { LoadingState } from "@/components/ui/loading-state";
import { hasSupabasePublicConfig } from "@/lib/env";
import { ErrorState } from "@/components/ui/error-state";

export const metadata = {
  title: "Ingresar",
};

export default function LoginPage() {
  const configured = hasSupabasePublicConfig();

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--brand)_22%,transparent),transparent_50%),linear-gradient(160deg,#e8f1ed,#f7f4ea)]" />
      <div className="w-full max-w-md space-y-8 rounded-[var(--radius)] border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] p-8 shadow-[var(--shadow)] backdrop-blur">
        <div className="space-y-3">
          <BrandMark />
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Accede a la plataforma foundation. Los módulos pastorales se habilitarán por
            fases.
          </p>
        </div>
        {!configured ? (
          <ErrorState
            title="Supabase no configurado"
            message="Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY para habilitar el login."
          />
        ) : (
          <Suspense fallback={<LoadingState label="Preparando acceso…" />}>
            <LoginForm />
          </Suspense>
        )}
      </div>
    </div>
  );
}
