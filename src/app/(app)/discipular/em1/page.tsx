import { redirect } from "next/navigation";

import {
  DiscipularLevelWorkbench,
  EM_LEVEL_CONFIG,
} from "@/components/formation/discipular-level-workbench";
import { hasPermission } from "@/modules/authorization";
import {
  ensureOfficialCatalog,
  getEmLevelsDashboardCounts,
  listEmLevelCycles,
  listEmLevelEligible,
} from "@/modules/formation";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "EM1 · Discipular" };

export default async function Em1Page() {
  const { session, auth } = await requireAppActor();
  if (
    !hasPermission(auth, "ministerial_school.read") &&
    !hasPermission(auth, "process.read")
  ) {
    redirect("/dashboard");
  }
  const level = 1 as const;
  await ensureOfficialCatalog();
  const [counts, cycles, eligible] = await Promise.all([
    getEmLevelsDashboardCounts(session.id),
    listEmLevelCycles(session.id, level),
    listEmLevelEligible(session.id, level),
  ]);
  return (
    <DiscipularLevelWorkbench
      config={EM_LEVEL_CONFIG[level]}
      kpis={[
        { label: "Curso/apto", value: counts.em1 },
        { label: "Completados", value: counts.em1Completed },
        { label: "Aptos (bandeja)", value: eligible.length },
      ]}
      eligible={eligible}
      cycles={cycles.map((c) => ({
        id: c.id,
        name: c.name,
        startDate: String(c.startDate),
        endDate: String(c.endDate),
        status: c.status,
      }))}
      canManageCycles={hasPermission(auth, "school.cycles.manage")}
      canEnroll={hasPermission(auth, "ministerial_school.manage")}
    />
  );
}
