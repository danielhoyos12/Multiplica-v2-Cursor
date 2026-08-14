import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/server/auth";
import { signOut } from "@/server/actions/auth";
import { hasSupabasePublicConfig } from "@/lib/env";
import { ensureAppUserProfile } from "@/modules/organization";

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

  return (
    <AppShell userEmail={user.email} signOutAction={signOut}>
      {children}
    </AppShell>
  );
}
