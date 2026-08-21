import { redirect } from "next/navigation";

export const metadata = { title: "Registro" };
export const dynamic = "force-dynamic";

/**
 * Public Clerk sign-up is disabled. Identities are provisioned by
 * leader activation (Clerk Backend API + Convex `provisionLeaderUser`).
 */
export default function SignUpDisabledPage() {
  redirect("/login?notice=no-signup");
}
