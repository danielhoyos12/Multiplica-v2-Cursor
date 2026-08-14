import { redirect } from "next/navigation";

import { createClient } from "@/server/supabase/server";

export async function signOut() {
  "use server";

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
