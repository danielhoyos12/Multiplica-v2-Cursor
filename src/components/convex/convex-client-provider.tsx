"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexConnectionIndicator } from "@/components/convex/convex-connection-indicator";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;

const client = url ? new ConvexReactClient(url) : null;

/**
 * App-wide Convex provider authenticated via Clerk JWTs.
 * Requires Clerk JWT template named `convex` and `CLERK_JWT_ISSUER_DOMAIN`
 * on the Convex deployment. When URL is missing, children still render
 * (Clerk auth works); data calls that need Convex will fail clearly.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client) {
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <ConvexConnectionIndicator />
      {children}
    </ConvexProviderWithClerk>
  );
}
