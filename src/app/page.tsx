import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/auth";
import { hasClerkPublicConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!hasClerkPublicConfig()) {
    redirect("/login");
  }

  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}
