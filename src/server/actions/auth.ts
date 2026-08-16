"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  MUST_CHANGE_PASSWORD_COOKIE,
  passwordGateCookieOptions,
} from "@/lib/password-change-gate";
import { createClient } from "@/server/supabase/server";

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.set(MUST_CHANGE_PASSWORD_COOKIE, "", {
    ...passwordGateCookieOptions(0),
    maxAge: 0,
  });

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
