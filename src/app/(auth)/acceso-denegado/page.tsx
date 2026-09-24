import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/layout/brand-mark";
import { signOut } from "@/server/actions/auth";
import { getSessionUser } from "@/server/auth";

export const metadata = { title: "Acceso no habilitado" };
export const dynamic = "force-dynamic";

/**
 * Clerk session exists but MULTIPLICA has no provisioned, active app user.
 * Does not create profiles or assign roles.
 */
export default async function AccesoDenegadoPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const appUser = await getSessionUser();
  if (appUser) {
    redirect("/dashboard");
  }

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--rice)] px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-card)]">
        <BrandMark />
        <div className="space-y-2">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Tu cuenta no está habilitada en MULTIPLICA
          </h1>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            {email
              ? `Sesión de autenticación: ${email}.`
              : "Hay una sesión de autenticación activa."}{" "}
            El acceso pastoral se crea únicamente cuando un líder es activado
            por el proceso de MULTIPLICA. No existe registro público.
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-4 py-2.5 text-sm font-medium text-white"
          >
            Cerrar sesión
          </button>
        </form>
        <p className="text-center text-sm">
          <Link href="/login" className="underline text-[var(--ink)]">
            Volver al login
          </Link>
        </p>
      </div>
    </div>
  );
}
