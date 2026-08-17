import { auth as clerkAuth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { filterSecondaryGroups } from "@/components/layout/nav-config";
import { PasswordGateShell } from "@/components/layout/password-gate-shell";
import { hasClerkPublicConfig } from "@/lib/env";
import { isPasswordChangeAllowedPath } from "@/lib/safe-redirect";
import {
  hasPermission,
  isSuperadmin,
  loadAuthContext,
} from "@/modules/authorization";
import { signOut } from "@/server/actions/auth";
import { getSessionUser } from "@/server/auth";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

export const dynamic = "force-dynamic";

/**
 * Authenticated pastoral shell. Clerk-signed-in users without a provisioned
 * MULTIPLICA profile never auto-create one and never enter the dashboard.
 */
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasClerkPublicConfig()) {
    redirect("/login");
  }

  const { userId } = await clerkAuth();
  const user = await getSessionUser();
  if (!user) {
    if (userId) {
      redirect("/acceso-denegado");
    }
    redirect("/login");
  }

  const client = await getAuthenticatedConvexClient();
  const profile = await client.query(api.users.getMe, {});

  if (!profile || profile.isActive === false) {
    redirect("/acceso-denegado");
  }

  const headerList = await headers();
  const pathname = headerList.get("x-multiplica-pathname") ?? "";
  const mustChange = Boolean(profile.mustChangePassword);

  if (mustChange && pathname && !isPasswordChangeAllowedPath(pathname)) {
    redirect("/cuenta/cambiar-password");
  }

  if (mustChange) {
    return (
      <PasswordGateShell userEmail={user.email} signOutAction={signOut}>
        {children}
      </PasswordGateShell>
    );
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
      {children}
    </AppShell>
  );
}
