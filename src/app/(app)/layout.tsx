import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { filterSecondaryGroups } from "@/components/layout/nav-config";
import { PasswordGateShell } from "@/components/layout/password-gate-shell";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { hasSupabasePublicConfig } from "@/lib/env";
import {
  MUST_CHANGE_PASSWORD_COOKIE,
  passwordGateCookieOptions,
} from "@/lib/password-change-gate";
import { isPasswordChangeAllowedPath } from "@/lib/safe-redirect";
import {
  hasPermission,
  isSuperadmin,
  loadAuthContext,
} from "@/modules/authorization";
import { ensureAppUserProfile } from "@/modules/organization";
import { signOut } from "@/server/actions/auth";
import { getSessionUser } from "@/server/auth";
import { createClient } from "@/server/supabase/server";

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
  const mustChange = Boolean(profile?.mustChangePassword);

  if (mustChange && pathname && !isPasswordChangeAllowedPath(pathname)) {
    redirect("/cuenta/cambiar-password");
  }

  if (mustChange) {
    // Keep Auth metadata + cookie in sync for middleware (no second source of truth).
    const cookieStore = await cookies();
    cookieStore.set(MUST_CHANGE_PASSWORD_COOKIE, "1", passwordGateCookieOptions());
    try {
      const supabase = await createClient();
      await supabase.auth.updateUser({ data: { must_change_password: true } });
    } catch {
      // Non-fatal: DB + cookie still gate navigation.
    }

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
