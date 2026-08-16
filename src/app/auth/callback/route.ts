import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import {
  MUST_CHANGE_PASSWORD_COOKIE,
  passwordGateCookieOptions,
} from "@/lib/password-change-gate";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createClient } from "@/server/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"), "/dashboard");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const isPasswordChangeFlow = next.startsWith("/cuenta/cambiar-password");

      if (user && isPasswordChangeFlow) {
        // Reuse existing users.must_change_password — mark recovery/first-login gate.
        await getDb()
          .update(users)
          .set({ mustChangePassword: true, updatedAt: new Date() })
          .where(eq(users.id, user.id));

        await supabase.auth.updateUser({
          data: { must_change_password: true },
        });

        const res = NextResponse.redirect(`${origin}${next}`);
        res.cookies.set(
          MUST_CHANGE_PASSWORD_COOKIE,
          "1",
          passwordGateCookieOptions(),
        );
        return res;
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
