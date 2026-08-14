import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";

/**
 * Service-role client for privileged server operations only.
 * Never import this into client components or expose the key.
 */
export function createServiceRoleClient() {
  const env = getServerEnv();

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for privileged operations.");
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
