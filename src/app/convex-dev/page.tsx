import { ConvexHealthPanel } from "@/components/convex/convex-health-panel";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Convex local dev" };

/** Avoid static prerender — Convex hooks need the client provider at runtime. */
export const dynamic = "force-dynamic";

/**
 * Public local-dev smoke surface for Convex.
 * Provider lives in root layout. Not part of pastoral Escalera.
 */
export default function ConvexDevPage() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-8 bg-[var(--rice)] px-4 py-10 text-[var(--ink)]">
      <PageHeader
        title="Convex local"
        description="Smoke local de Convex. Auth de la app: Clerk + JWT template convex."
      />
      <ConvexHealthPanel />
    </div>
  );
}
