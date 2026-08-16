"use client";

import {
  ConvexConnectionIndicator,
  ConvexDisconnectedIndicator,
} from "@/components/convex/convex-connection-indicator";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;

const client = url ? new ConvexReactClient(url) : null;

/**
 * Optional Convex provider for local-dev spike routes.
 * Main MULTIPLICA app continues to use Supabase.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client) {
    return (
      <>
        <ConvexDisconnectedIndicator />
        <div className="mx-auto max-w-lg space-y-3 py-12 text-sm text-[var(--muted)]">
          <p className="font-medium text-[var(--ink)]">Convex no configurado</p>
          <p>
            Define <code>NEXT_PUBLIC_CONVEX_URL</code> (vía{" "}
            <code>CONVEX_AGENT_MODE=anonymous npx convex dev</code>) y reinicia el
            frontend.
          </p>
        </div>
      </>
    );
  }

  return (
    <ConvexProvider client={client}>
      <ConvexConnectionIndicator />
      {children}
    </ConvexProvider>
  );
}
