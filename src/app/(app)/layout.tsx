import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { filterSecondaryGroups } from "@/components/layout/nav-config";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { hasSupabasePublicConfig } from "@/lib/env";
import { isPasswordChangeAllowedPath } from "@/lib/safe-redirect";
import {
  hasPermission,
  isSuperadmin,
  loadAuthContext,
} from "@/modules/authorization";
import { ensureAppUserProfile } from "@/modules/organization";
import { signOut } from "@/server/actions/auth";
import { getSessionUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabasePublicConfig()) {
    redirect("/login");
  }

  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (user.email) {
    await ensureAppUserProfile({ id: user.id, email: user.email });
  }

  const [profile] = await getDb()
    .select({
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (profile && profile.isActive === false) {
    redirect("/login?error=inactive");
  }

  const headerList = await headers();
  const pathname = headerList.get("x-multiplica-pathname") ?? "";

  if (
    profile?.mustChangePassword &&
    pathname &&
    !isPasswordChangeAllowedPath(pathname)
  ) {
    redirect("/cuenta/cambiar-password");
  }

  const auth = await loadAuthContext(user.id);
  const secondaryGroups = filterSecondaryGroups({
    canReadMinistries:
      hasPermission(auth, "ministry.read") ||
      hasPermission(auth, "ministry.manage"),
    canReadNetworks: hasPermission(auth, "network.read"),
    canReadUsers: hasPermission(auth, "users.read"),
    canViewSystemHealth: isSuperadmin(auth),
  });

  return (
    <AppShell
      userEmail={user.email}
      signOutAction={signOut}
      secondaryGroups={secondaryGroups}
    >
      {profile?.mustChangePassword ? (
        <div
          role="status"
          className="mb-4 rounded-[var(--radius-sm)] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-4 py-3 text-sm"
        >
          Debes cambiar tu contraseña temporal para continuar. Solo esta página
          está disponible hasta completarlo.
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
