"use client";

import { ConvexConnectionIndicator } from "@/components/convex/convex-connection-indicator";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;

const client = url ? new ConvexReactClient(url) : null;

/**
 * App-wide Convex provider. When URL is missing, children still render
 * (Clerk auth works); data calls that need Convex will fail clearly.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client) {
    return <>{children}</>;
  }

  return (
    <ConvexProvider client={client}>
      <ConvexConnectionIndicator />
      {children}
    </ConvexProvider>
  );
}
