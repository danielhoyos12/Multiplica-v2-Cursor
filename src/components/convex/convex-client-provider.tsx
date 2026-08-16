"use client";

import { useAuth } from "@clerk/nextjs";
import {
  ConvexConnectionIndicator,
  ConvexDisconnectedIndicator,
} from "@/components/convex/convex-connection-indicator";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** From server layout so build-time placeholders work (non-NEXT_PUBLIC env). */
  convexUrl?: string | null;
};

/**
 * App-wide Convex provider authenticated via Clerk JWTs.
 * Requires Clerk JWT template named `convex` and `CLERK_JWT_ISSUER_DOMAIN`
 * on the Convex deployment.
 */
export function ConvexClientProvider({ children, convexUrl }: Props) {
  const url = convexUrl ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? null;
  const client = useMemo(
    () => (url ? new ConvexReactClient(url) : null),
    [url],
  );

  if (!client) {
    return (
      <>
        <ConvexDisconnectedIndicator />
        {children}
      </>
    );
  }

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <ConvexConnectionIndicator />
      {children}
    </ConvexProviderWithClerk>
  );
}
