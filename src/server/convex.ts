import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";

let httpClient: ConvexHttpClient | null = null;

/** Server-side Convex client (queries/mutations from RSC / actions). */
export function getConvexHttpClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is required. Run `npm run convex:dev` (anonymous local) or configure a Convex deployment.",
    );
  }
  if (!httpClient) {
    httpClient = new ConvexHttpClient(url);
  }
  return httpClient;
}

export { api };
