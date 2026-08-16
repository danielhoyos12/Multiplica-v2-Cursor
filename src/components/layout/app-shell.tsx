import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { BottomDock } from "@/components/layout/bottom-dock";
import type { NavSecondaryGroup } from "@/components/layout/nav-config";

type AppShellProps = {
  children: ReactNode;
  userEmail?: string | null;
  signOutAction?: () => Promise<void>;
  secondaryGroups?: NavSecondaryGroup[];
};

/**
 * Neo Editorial shell:
 * - Rice Paper canvas
 * - Desktop floating ink sidebar (overlay expand, no layout shift)
 * - Tablet/mobile bottom dock + sheets
 * Auth / children wiring unchanged.
 */
export function AppShell({
  children,
  userEmail,
  signOutAction,
  secondaryGroups,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[var(--rice)] text-[var(--ink)]">
      <AppSidebar
        userEmail={userEmail}
        signOutAction={signOutAction}
        secondaryGroups={secondaryGroups}
      />

      <div className={cnMain}>
        <main className="mx-auto w-full max-w-[var(--content-max)] px-4 py-6 sm:px-6 sm:py-8 min-[1180px]:px-8">
          {children}
        </main>
      </div>

      <BottomDock
        userEmail={userEmail}
        signOutAction={signOutAction}
        secondaryGroups={secondaryGroups}
      />
    </div>
  );
}

/** Main keeps a constant rail gutter on desktop; expanded sidebar overlays without shifting. */
const cnMain =
  "min-h-screen pb-[calc(var(--dock-height)+env(safe-area-inset-bottom)+12px)] min-[1180px]:pb-8 min-[1180px]:pl-[calc(var(--sidebar-collapsed)+var(--sidebar-inset)*2)]";
