import { redirect } from "next/navigation";

import { CONSOLIDAR_STAGE_CONFIG } from "@/components/formation/consolidar-stage-config";
import { ConsolidarStageWorkbench } from "@/components/formation/consolidar-stage-workbench";
import { hasPermission } from "@/modules/authorization";
import {
  ensureOfficialCatalog,
  getConsolidarDashboardCounts,
  listConsolidarCycles,
  listConsolidarEligible,
  listConsolidarStageModules,
} from "@/modules/formation";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Post-Encuentro · Consolidar" };

export default async function PostEncuentroPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  const config = CONSOLIDAR_STAGE_CONFIG.post;
  await ensureOfficialCatalog();
  const [counts, eligible, cycles, modules] = await Promise.all([
    getConsolidarDashboardCounts(session.id),
    listConsolidarEligible(session.id, config.stage),
    listConsolidarCycles(session.id, config.stage),
    listConsolidarStageModules(config.stage),
  ]);

  return (
    <ConsolidarStageWorkbench
      config={config}
      counts={{
        aptos: counts.postAptos,
        inProgress: counts.postInProgress,
        completed: counts.postCompleted,
      }}
      eligible={eligible}
      modules={modules}
      cycles={cycles.map((c) => ({
        id: c.id,
        name: c.name,
        startDate: String(c.startDate),
        endDate: String(c.endDate),
        enrollmentOpenDate: c.enrollmentOpenDate ? String(c.enrollmentOpenDate) : null,
        enrollmentCloseDate: c.enrollmentCloseDate ? String(c.enrollmentCloseDate) : null,
        status: c.status,
      }))}
      canManageCycles={hasPermission(auth, "school.cycles.manage")}
      canApprove={hasPermission(auth, "consolidation.manage")}
    />
  );
}
