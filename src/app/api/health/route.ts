import { NextResponse } from "next/server";

import { createClient as createServerSupabase } from "@/server/supabase/server";
import { hasDatabaseUrl, hasSupabasePublicConfig } from "@/lib/env";

export async function GET() {
  const checks = {
    supabasePublicConfig: hasSupabasePublicConfig(),
    databaseUrl: hasDatabaseUrl(),
    authSessionReadable: false as boolean,
  };

  if (checks.supabasePublicConfig) {
    try {
      const supabase = await createServerSupabase();
      await supabase.auth.getSession();
      checks.authSessionReadable = true;
    } catch {
      checks.authSessionReadable = false;
    }
  }

  const ok = checks.supabasePublicConfig;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      service: "multiplica",
      phase: "0-foundation",
      checks,
    },
    { status: ok ? 200 : 503 },
  );
}
