import { auth as clerkAuth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { filterSecondaryGroups } from "@/components/layout/nav-config";
import { PasswordGateShell } from "@/components/layout/password-gate-shell";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { hasClerkPublicConfig } from "@/lib/env";
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

/**
 * Authenticated layout — READ-ONLY regarding cookies / Auth metadata.
 * Gate cookie is set in middleware / password actions (not during RSC render).
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
    // Signed into Clerk but no app profile yet (often missing interim DB).
    // Avoid /login ↔ /dashboard redirect loops.
    if (userId) {
      redirect("/bienvenida");
    }
    redirect("/login");
  }


  if (user.email) {
    await ensureAppUserProfile({
      clerkUserId: user.clerkUserId,
      email: user.email,
    });
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
  const mustChange = Boolean(profile?.mustChangePassword);

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
