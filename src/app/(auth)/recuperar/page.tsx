import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Recuperar contraseña" };

export default function RecuperarPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-[var(--rice)] px-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink)]">
          Recuperar contraseña
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Te enviaremos un enlace si el correo está registrado. Por seguridad no
          confirmamos si la cuenta existe.
        </p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm underline">
        Volver al inicio de sesión
      </Link>
    </div>
  );
}
