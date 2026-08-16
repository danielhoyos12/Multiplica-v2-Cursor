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

export default function LoginPage() {
  const configured = hasClerkPublicConfig();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--rice)] px-4 py-10">
      <div className="absolute top-4 right-4">
        <ClerkAuthControls />
      </div>
      <div className="w-full max-w-md space-y-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-card)]">
        <div className="space-y-3">
          <BrandMark />
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Accede a MULTIPLICA. Usa tu correo y contraseña asignados.
          </p>
        </div>
        {!configured ? (
          <ErrorState
            title="Clerk no configurado"
            message="Define NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY y CLERK_SECRET_KEY para habilitar el login. Luego: clerk auth login && clerk init --app app_3I0zc3YzaXVrDXUXSnaqXDfwzjj"
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
