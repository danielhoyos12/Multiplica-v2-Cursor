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
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--rice)] px-4 py-10">
      <div className="w-full max-w-md space-y-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-card)]">
        <div className="space-y-3">
          <BrandMark />
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Accede a MULTIPLICA. Usa tu correo y contraseña asignados.
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
