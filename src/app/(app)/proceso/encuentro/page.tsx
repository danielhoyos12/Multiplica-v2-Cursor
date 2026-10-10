import { redirect } from "next/navigation";

import { CONSOLIDAR_STAGE_CONFIG } from "@/components/formation/consolidar-stage-config";
import { ConsolidarStageWorkbench } from "@/components/formation/consolidar-stage-workbench";
import { hasPermission } from "@/modules/authorization";
import {
  ensureOfficialCatalog,
  getConsolidarDashboardCounts,
  listConsolidarCycles,
  listConsolidarEligible,
} from "@/modules/formation";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Encuentro · Consolidar" };

export default async function EncuentroPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  const config = CONSOLIDAR_STAGE_CONFIG.encuentro;
  await ensureOfficialCatalog();
  const [counts, eligible, cycles] = await Promise.all([
    getConsolidarDashboardCounts(session.id),
    listConsolidarEligible(session.id, config.stage),
    listConsolidarCycles(session.id, config.stage),
  ]);

  return (
    <ConsolidarStageWorkbench
      config={config}
      counts={{
        aptos: counts.encuentroAptos,
        inProgress: counts.encuentroInProgress,
        completed: counts.encuentroCompleted,
      }}
      eligible={eligible}
      cycles={cycles.map((c) => ({
        id: c.id,
        name: c.name,
        startDate: String(c.startDate),
        endDate: String(c.endDate),
        status: c.status,
      }))}
      canManageCycles={hasPermission(auth, "school.cycles.manage")}
      canApprove={hasPermission(auth, "consolidation.manage")}
    />
  );
}
