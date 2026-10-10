import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard, KpiCard, SectionHeader, StatGroup } from "@/components/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { hasPermission } from "@/modules/authorization";
import {
  getDestinoDashboardCounts,
  getEmLevelsDashboardCounts,
  getReencuentroDashboardCounts,
} from "@/modules/formation";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Discipular · Escuela de Líderes" };

export default async function DiscipularHubPage() {
  const { session, auth } = await requireAppActor();
  if (
    !hasPermission(auth, "process.read") &&
    !hasPermission(auth, "destination.read") &&
    !hasPermission(auth, "ministerial_school.read")
  ) {
    redirect("/dashboard");
  }

  const [destino, re, em] = await Promise.all([
    getDestinoDashboardCounts(session.id),
    getReencuentroDashboardCounts(session.id),
    getEmLevelsDashboardCounts(session.id),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Discipular"
        description="Escuela de Líderes: Capacitación Destino → Re-Encuentro → Escuela Ministerial. Cada nivel tiene pantalla operativa propia."
        actions={
          <Link href="/discipular/multiplicacion" className="text-sm font-medium underline">
            Plan 3–12
          </Link>
        }
      />

      <section className="space-y-3">
        <SectionHeader
          eyebrow="Capacitación Destino"
          title="CD1 · CD2 · CD3"
          description="CD1 requiere UDLV completa. Secuencia: CD1 → CD2 → Re-Encuentro → CD3."
        />
        <StatGroup columns={3} aria-label="Capacitación Destino">
          <KpiCard label="CD1 curso/apto" value={destino.n1InProgress} />
          <KpiCard label="CD2 curso/apto" value={destino.n2InProgress} />
          <KpiCard label="CD3 curso/apto" value={destino.n3InProgress} />
          <KpiCard label="Aptos CD1" value={destino.aptosN1} />
          <KpiCard label="Aptos CD2" value={destino.aptosN2} />
          <KpiCard label="Aptos CD3" value={destino.aptosN3} />
        </StatGroup>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/discipular/cd1" className="underline">
            Abrir CD1
          </Link>
          <Link href="/discipular/cd2" className="underline">
            Abrir CD2
          </Link>
          <Link href="/discipular/cd3" className="underline">
            Abrir CD3
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          eyebrow="Re-Encuentro"
          title="Entre CD2 y CD3"
          description="No activa liderazgo. Completar habilita CD3."
        />
        <StatGroup columns={3} aria-label="Re-Encuentro">
          <KpiCard label="Elegibles" value={re.eligible} />
          <KpiCard label="Completados" value={re.completed} />
          <KpiCard label="Pendientes" value={re.pending} />
        </StatGroup>
        <Link href="/reencuentro" className="text-sm underline">
          Abrir Re-Encuentro
        </Link>
      </section>

      <section className="space-y-3">
        <SectionHeader
          eyebrow="Escuela Ministerial"
          title="EM1 · EM2 · EM3"
          description="Tras CD3. Avance académico independiente del objetivo ministerial 3–12."
        />
        <StatGroup columns={3} aria-label="Escuela Ministerial">
          <KpiCard label="EM1 curso/apto" value={em.em1} />
          <KpiCard label="EM2 curso/apto" value={em.em2} />
          <KpiCard label="EM3 curso/apto" value={em.em3} />
          <KpiCard label="EM1 completados" value={em.em1Completed} />
          <KpiCard label="EM2 completados" value={em.em2Completed} />
          <KpiCard label="EM3 completados" value={em.em3Completed} />
        </StatGroup>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/discipular/em1" className="underline">
            Abrir EM1
          </Link>
          <Link href="/discipular/em2" className="underline">
            Abrir EM2
          </Link>
          <Link href="/discipular/em3" className="underline">
            Abrir EM3
          </Link>
        </div>
      </section>

      <DataCard className="space-y-2 text-sm text-[var(--muted)]">
        <SectionHeader
          title="Compatibilidad"
          description="Las rutas legacy /destino y /escuela-ministerial siguen activas y comparten el mismo dominio."
        />
      </DataCard>
    </div>
  );
}
