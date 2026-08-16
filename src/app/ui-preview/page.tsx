import { notFound } from "next/navigation";

import { DashboardBoard } from "@/components/dashboard/dashboard-board";
import {
  previewDashboard,
  previewEmptyDashboard,
} from "@/components/dashboard/preview-fixture";
import { AppShell } from "@/components/layout/app-shell";

export const metadata = { title: "UI Preview" };
export const dynamic = "force-dynamic";

/**
 * Visual harness for Neo Editorial shell + Phase 2 dashboard.
 * Enabled only with MULTIPLICA_UI_PREVIEW=1 or development — not a pastoral route.
 */
export default async function UiPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const allowed =
    process.env.MULTIPLICA_UI_PREVIEW === "1" || process.env.NODE_ENV === "development";
  if (!allowed) {
    notFound();
  }

  const { view } = await searchParams;
  const empty = view === "empty";
  const dash = empty ? previewEmptyDashboard : previewDashboard;

  return (
    <AppShell userEmail="preview@multiplica.local">
      <DashboardBoard
        dash={dash}
        period="this_month"
        ministries={[
          { id: "m1", code: "GEN", name: "General" },
          { id: "m2", code: "JUV", name: "Juventud" },
        ]}
        networks={[
          { id: "n1", code: "N1", name: "Red Norte" },
          { id: "n2", code: "N2", name: "Red Sur" },
        ]}
        showMinistryFilter
        isSuperadmin={false}
      />
    </AppShell>
  );
}
