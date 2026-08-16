import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  userEmail?: string | null;
  signOutAction?: () => Promise<void>;
};

/**
 * Minimal shell for must-change-password / recovery.
 * No sidebar, dock, or pastoral navigation.
 */
export function PasswordGateShell({ children, userEmail, signOutAction }: Props) {
  return (
    <div className="min-h-screen bg-[var(--rice)] text-[var(--ink)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-4">
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
            MULTIPLICA
          </p>
          <div className="flex items-center gap-3 text-sm">
            {userEmail ? (
              <span className="hidden truncate text-[var(--muted)] sm:inline" title={userEmail}>
                {userEmail}
              </span>
            ) : null}
            {signOutAction ? (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="neo-touch min-h-11 underline-offset-4 hover:underline"
                >
                  Cerrar sesión
                </button>
              </form>
            ) : (
              <Link href="/login" className="underline-offset-4 hover:underline">
                Salir
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-10">{children}</main>
    </div>
  );
}
