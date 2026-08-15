import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CellMembersPanel } from "@/components/cells/members-panel";
import { ConvertTwelvePanel } from "@/components/leadership/convert-twelve-panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission } from "@/modules/authorization";
import {
  cellStatusLabel,
  cellTypeLabel,
  getCellDetail,
  listCellsForActor,
} from "@/modules/cells";
import { closeCellAction } from "@/modules/cells/actions";
import { countsAsTwelveLeader, getTwelveProgress } from "@/modules/leadership";
import { getPersonsProcessSummary, statusLabel } from "@/modules/formation";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Detalle de célula" };

type Params = Promise<{ id: string }>;

export default async function CellDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "cells.read")) {
    redirect("/dashboard");
  }

  let detail;
  try {
    detail = await getCellDetail(session.id, id);
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === DomainErrorCode.CELL_NOT_FOUND ||
        error.code === DomainErrorCode.CELL_NOT_AUTHORIZED ||
        error.code === DomainErrorCode.NOT_AUTHORIZED)
    ) {
      notFound();
    }
    throw error;
  }

  const siblings = await listCellsForActor(session.id, {
    ministryId: detail.cell.ministryId,
    status: "active",
    pageSize: 50,
  });
  const siblingCells = siblings.rows
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, name: c.name }));

  const canManage = hasPermission(auth, "cells.manage_members");
  const canUpdate = hasPermission(auth, "cells.update");
  const canAttendance = hasPermission(auth, "cells.attendance");
  const canConvert = hasPermission(auth, "g12.convert_twelve");
  const today = new Date().toISOString().slice(0, 10);

  let progress = { current: 0, max: 12, ready: false, label: "0 / 12 líderes" };
  if (detail.cell.responsiblePersonId) {
    progress = await getTwelveProgress(detail.cell.responsiblePersonId);
  }

  const membersForConvert = await Promise.all(
    detail.members
      .filter((m) => m.status === "active")
      .map(async (m) => ({
        personId: m.personId,
        fullName: m.fullName,
        isActiveLeader: await countsAsTwelveLeader(m.personId),
      })),
  );

  const processMap = await getPersonsProcessSummary(
    detail.members.filter((m) => m.status === "active").map((m) => m.personId),
  );
  const membersWithProcess = detail.members.map((m) => ({
    ...m,
    consolidarStatus: processMap[m.personId]?.consolidar
      ? statusLabel(processMap[m.personId]!.consolidar!)
      : undefined,
    udvStatus: processMap[m.personId]?.udv
      ? statusLabel(processMap[m.personId]!.udv!)
      : undefined,
    destinoLabel: processMap[m.personId]?.destinoLabel,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title={detail.cell.name}
        description={detail.cell.code ? `Código ${detail.cell.code}` : "Sin código humano"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/celulas" className="text-sm font-medium underline">
              Volver
            </Link>
            {canAttendance ? (
              <Link
                href={`/celulas/${id}/asistencia?date=${today}`}
                className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white"
              >
                Registrar asistencia
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge label={cellTypeLabel(detail.cell.type)} tone="brand" />
        <StatusBadge
          label={cellStatusLabel(detail.cell.status)}
          tone={detail.cell.status === "active" ? "success" : "warning"}
        />
        {detail.cell.type === "evangelistic" ? (
          <StatusBadge
            label={progress.ready ? "READY_FOR_TWELVE_CONVERSION" : progress.label}
            tone={progress.ready ? "success" : "warning"}
          />
        ) : null}
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Info
          title="Organización"
          items={[
            [
              "Ministerio",
              detail.ministry
                ? `${detail.ministry.code} — ${detail.ministry.name}`
                : "—",
            ],
            ["Red", detail.network?.name ?? "—"],
            ["Responsable", detail.responsible?.fullName ?? "Sin asignar"],
            ["Horario", detail.cell.scheduleLabel],
            ["Zona horaria", detail.cell.timezone],
            ["Dirección", detail.cell.address ?? "—"],
            ["Distrito", detail.district?.name ?? "—"],
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Miembros activos" value={detail.activeMemberCount} />
          <Kpi
            label="Última asistencia"
            value={
              detail.lastSessionStats?.pct === null || detail.lastSessionStats === null
                ? "—"
                : `${detail.lastSessionStats.pct}%`
            }
          />
          <Kpi
            label="Asistentes última"
            value={
              detail.lastSessionStats
                ? `${detail.lastSessionStats.present}/${detail.lastSessionStats.total}`
                : "—"
            }
          />
          <Kpi
            label="Promedio 4 reuniones"
            value={detail.avgLast4 === null ? "—" : `${detail.avgLast4}%`}
          />
        </div>
      </section>

      <CellMembersPanel
        cellId={id}
        members={membersWithProcess}
        siblingCells={siblingCells}
        canManage={canManage}
      />

      {canConvert && detail.cell.type === "evangelistic" && detail.cell.status === "active" ? (
        <ConvertTwelvePanel
          cellId={id}
          members={membersForConvert}
          readyForTwelve={progress.ready}
          progressLabel={progress.label}
        />
      ) : null}

      {canUpdate && detail.cell.status !== "closed" ? (
        <form
          action={async () => {
            "use server";
            await closeCellAction(id);
          }}
        >
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
          >
            Cerrar célula
          </button>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Bloqueado si hay miembros activos. Requiere resolución explícita.
          </p>
        </form>
      ) : null}
    </div>
  );
}

function Info({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="mb-3 font-medium">{title}</h2>
      <dl className="space-y-2 text-sm">
        {items.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7rem_1fr] gap-2">
            <dt className="text-[var(--muted)]">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-medium">{value}</p>
    </div>
  );
}
