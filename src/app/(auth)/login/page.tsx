import { Suspense } from "react";

import { BrandMark } from "@/components/layout/brand-mark";
import { ClerkAuthControls } from "@/components/auth/clerk-auth-controls";
import { LoginForm } from "@/components/auth/login-form";
import { LoadingState } from "@/components/ui/loading-state";
import { hasClerkPublicConfig } from "@/lib/env";
import { ErrorState } from "@/components/ui/error-state";

export const metadata = {
  title: "Ingresar",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const configured = hasClerkPublicConfig();
  const params = await searchParams;
  const noSignup = params.notice === "no-signup";
  const inactive = params.error === "inactive";

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--rice)] px-4 py-10">
      <div className="absolute top-4 right-4">
        <ClerkAuthControls />
      </div>
      <div className="w-full max-w-md space-y-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-card)]">
        <div className="space-y-3">
          <BrandMark />
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Accede a MULTIPLICA. Usa el correo y la contraseña asignados al
            activar tu liderazgo. No hay registro público.
          </p>
          {noSignup ? (
            <p className="text-sm text-[var(--muted)]">
              Las cuentas se crean únicamente por el proceso pastoral de
              activación de líderes.
            </p>
          ) : null}
          {inactive ? (
            <ErrorState
              title="Cuenta inactiva"
              message="Tu usuario MULTIPLICA está inactivo. Contacta a un administrador."
            />
          ) : null}
        </div>
        {!configured ? (
          <ErrorState
            title="Clerk no configurado"
            message="Define NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY y CLERK_SECRET_KEY para habilitar el login."
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
