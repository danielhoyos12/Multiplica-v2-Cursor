/**
 * Clerk JWT provider for Convex.
 *
 * Set `CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment (Dashboard → Settings →
 * Environment Variables), e.g. `https://boss-gull-2637.clerk.accounts.dev`.
 *
 * Clerk Dashboard must have a JWT template named `convex` (aud = "convex").
 *
 * @see https://docs.convex.dev/auth/clerk
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
