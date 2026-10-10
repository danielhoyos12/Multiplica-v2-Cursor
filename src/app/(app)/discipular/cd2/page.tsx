import { redirect } from "next/navigation";

import {
  CD_LEVEL_CONFIG,
  DiscipularLevelWorkbench,
} from "@/components/formation/discipular-level-workbench";
import { hasPermission } from "@/modules/authorization";
import {
  ensureDestinoPrograms,
  getDestinoDashboardCounts,
  listDestinoCycles,
  listDestinoEligible,
} from "@/modules/formation";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "CD2 · Discipular" };

export default async function Cd2Page() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "destination.read") && !hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }
  const level = 2 as const;
  await ensureDestinoPrograms();
  const [counts, cycles, eligible] = await Promise.all([
    getDestinoDashboardCounts(session.id),
    listDestinoCycles(session.id, level),
    listDestinoEligible(session.id, level),
  ]);
  return (
    <DiscipularLevelWorkbench
      config={CD_LEVEL_CONFIG[level]}
      kpis={[
        { label: "Curso/apto", value: counts.n2InProgress },
        { label: "Aptos", value: counts.aptosN2 },
        { label: "Graduados", value: counts.n2Completed },
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
      canEnroll={hasPermission(auth, "destination.manage")}
    />
  );
}
