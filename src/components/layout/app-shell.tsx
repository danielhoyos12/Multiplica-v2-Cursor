import type { ReactNode } from "react";

import { BrandMark } from "@/components/layout/brand-mark";
import { AppSidebar } from "@/components/layout/app-sidebar";

type AppShellProps = {
  children: ReactNode;
  userEmail?: string | null;
  signOutAction?: () => Promise<void>;
};

export function AppShell({ children, userEmail, signOutAction }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--brand)_18%,transparent),transparent_55%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_50%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col lg:flex-row">
        <aside className="border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] px-5 py-6 backdrop-blur-md lg:w-64 lg:border-b-0 lg:border-r">
          <div className="mb-8">
            <BrandMark />
          </div>
          <AppSidebar />
          <div className="mt-10 space-y-3 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            {userEmail ? <p className="truncate">{userEmail}</p> : null}
            {signOutAction ? (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-left text-[var(--brand-ink)] underline-offset-2 hover:underline"
                >
                  Cerrar sesión
                </button>
              </form>
            ) : null}
          </div>
        </aside>
        <main className="flex-1 px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
