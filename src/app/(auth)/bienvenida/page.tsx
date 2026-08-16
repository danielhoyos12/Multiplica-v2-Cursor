import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/layout/brand-mark";
import { hasDatabaseUrl } from "@/lib/env";
import { getSessionUser } from "@/server/auth";

export const metadata = { title: "Bienvenida" };
export const dynamic = "force-dynamic";

/**
 * Post sign-up landing outside the pastoral app shell.
 * Avoids /login ↔ /dashboard redirect loops when interim Postgres is unavailable.
 */
export default async function BienvenidaPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-up");
  }

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;

  const appUser = await getSessionUser();
  const canEnterApp = Boolean(appUser) && hasDatabaseUrl();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--rice)] px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-card)]">
        <BrandMark />
        <div className="space-y-2">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Cuenta creada
          </h1>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            {email
              ? `Sesión iniciada como ${email}.`
              : "Tu cuenta de Clerk quedó registrada."}
          </p>
        </div>
        {canEnterApp ? (
          <Link
            href="/dashboard"
            className="inline-flex w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-4 py-2.5 text-sm font-medium text-white"
          >
            Ir al dashboard
          </Link>
        ) : (
          <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper-100)] p-4 text-sm text-[var(--muted)]">
            <p>
              El acceso pastoral necesita el perfil de aplicación (Convex /
              Postgres interim). Tu cuenta de autenticación ya está lista.
            </p>
            <p>
              Si eres operador, configura el data plane y vuelve a ingresar.
            </p>
          </div>
        )}
        <p className="text-center text-sm">
          <Link href="/login" className="underline text-[var(--ink)]">
            Volver al login
          </Link>
        </p>
      </div>
    </div>
  );
}
