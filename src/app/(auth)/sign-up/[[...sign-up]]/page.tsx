import { SignUp } from "@clerk/nextjs";
import { BrandMark } from "@/components/layout/brand-mark";
import { ClerkAuthControls } from "@/components/auth/clerk-auth-controls";
import { hasClerkPublicConfig } from "@/lib/env";
import { ErrorState } from "@/components/ui/error-state";
import Link from "next/link";

export const metadata = {
  title: "Crear cuenta",
};

/**
 * Clerk sign-up (path routing). Must match NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up.
 */
export default function SignUpPage() {
  const configured = hasClerkPublicConfig();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--rice)] px-4 py-10">
      <div className="absolute top-4 right-4">
        <ClerkAuthControls />
      </div>
      <div className="w-full max-w-md space-y-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-card)]">
        <div className="space-y-3">
          <BrandMark />
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Crea tu cuenta en MULTIPLICA.
          </p>
        </div>
        {!configured ? (
          <ErrorState
            title="Clerk no configurado"
            message="Define NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY y CLERK_SECRET_KEY para habilitar el registro."
          />
        ) : (
          <div className="flex justify-center [&_.cl-rootBox]:w-full [&_.cl-cardBox]:w-full [&_.cl-card]:shadow-none [&_.cl-card]:border-0 [&_.cl-card]:bg-transparent">
            <SignUp
              routing="path"
              path="/sign-up"
              signInUrl="/login"
              forceRedirectUrl="/dashboard"
              fallbackRedirectUrl="/dashboard"
              appearance={{
                variables: {
                  colorPrimary: "#e33b24",
                  colorBackground: "#ffffff",
                  borderRadius: "0.375rem",
                },
              }}
            />
          </div>
        )}
        <p className="text-center text-sm text-[var(--muted)]">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="underline text-[var(--ink)]">
            Ingresar
          </Link>
        </p>
      </div>
    </div>
  );
}
