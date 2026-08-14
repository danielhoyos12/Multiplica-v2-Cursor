import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/auth";
import { hasSupabasePublicConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!hasSupabasePublicConfig()) {
    redirect("/login");
  }

  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}
