import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/auth";

export const metadata = { title: "Bienvenida" };
export const dynamic = "force-dynamic";

/** Legacy post-signup route — redirects to login or denied access. */
export default async function BienvenidaPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const appUser = await getSessionUser();
  if (appUser) {
    redirect("/dashboard");
  }
  redirect("/acceso-denegado");
}
