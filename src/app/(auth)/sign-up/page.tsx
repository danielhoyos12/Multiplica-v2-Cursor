import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { hasClerkPublicConfig } from "@/lib/env";
import { ErrorState } from "@/components/ui/error-state";

export const metadata = {
  title: "Crear cuenta",
};

export const dynamic = "force-dynamic";

/**
 * Dedicated sign-up page. Uses hash routing so Clerk never depends on
 * catch-all path segments or a mis-set hosted Account Portal URL.
 */
export default function SignUpPage() {
  const configured = hasClerkPublicConfig();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--rice)] px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-card)]">
        <div className="space-y-3">
          <BrandMark />
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Crear cuenta
          </h1>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Regístrate en MULTIPLICA con tu correo.
          </p>
        </div>
        {!configured ? (
          <ErrorState
            title="Clerk no configurado"
            message="Define NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY y CLERK_SECRET_KEY."
          />
        ) : (
          <div className="flex justify-center [&_.cl-rootBox]:w-full [&_.cl-cardBox]:w-full [&_.cl-card]:shadow-none [&_.cl-card]:border-0 [&_.cl-card]:bg-transparent">
            <SignUp
              routing="hash"
              signInUrl="/login"
              forceRedirectUrl="/bienvenida"
              fallbackRedirectUrl="/bienvenida"
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
