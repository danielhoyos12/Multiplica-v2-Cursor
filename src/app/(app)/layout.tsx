import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { hasSupabasePublicConfig } from "@/lib/env";
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
    .select({ mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <AppShell userEmail={user.email} signOutAction={signOut}>
      {profile?.mustChangePassword ? (
        <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-4 py-3 text-sm">
          Debes{" "}
          <a href="/cuenta/cambiar-password" className="font-medium underline">
            cambiar tu contraseña temporal
          </a>{" "}
          antes de operar con normalidad.
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
