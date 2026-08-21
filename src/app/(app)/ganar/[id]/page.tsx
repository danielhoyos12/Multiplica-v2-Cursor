import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DataCard } from "@/components/dashboard/data-card";
import { EditPersonForm } from "@/components/ganar/edit-person-form";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
import { getPersonLadder, statusLabel } from "@/modules/formation";
import {
  completeConsolidationAction,
  startConsolidationAction,
} from "@/modules/formation/actions";
import {
  formatFullName,
  getMinistryNetworkMaps,
  getPersonForActor,
  listCatalogsForGanar,
} from "@/modules/ganar";
import { requireAppActor } from "@/server/actor";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

import type { Id } from "../../../../../convex/_generated/dataModel";

export const metadata = { title: "Persona · GANAR" };

type Params = Promise<{ id: string }>;

const NAV = [
  { id: "identidad", label: "Identidad" },
  { id: "pertenencia", label: "Pertenencia" },
  { id: "liderazgo", label: "Liderazgo" },
  { id: "escalera", label: "Escalera" },
  { id: "historial", label: "Historial" },
  { id: "acciones", label: "Acciones" },
];

export default async function PersonDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "persons.read")) {
    redirect("/dashboard");
  }

  let detail;
  try {
    detail = await getPersonForActor(session.id, id);
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === DomainErrorCode.NOT_FOUND ||
        error.code === DomainErrorCode.NOT_AUTHORIZED)
    ) {
      notFound();
    }
    throw error;
  }

  const catalogs = await listCatalogsForGanar(session.id);
  const maps = await getMinistryNetworkMaps();
  const canWrite = hasPermission(auth, "persons.write");
  const canSeePrayer = isSuperadmin(auth) || hasPermission(auth, "persons.read");
  const canMarkEligible = hasPermission(auth, "leaders.mark_eligible");
  const canActivate = hasPermission(auth, "leaders.activate");
  const canProcess = hasPermission(auth, "process.update");
  const canCompleteConsol = hasPermission(auth, "consolidation.manage");
  const canTransfers = hasPermission(auth, "transfers.read");

  const client = await getAuthenticatedConvexClient();
  const leadership = await client.query(api.leadership.getByPerson, {
    personId: id as Id<"persons">,
  });

  let ladder: Awaited<ReturnType<typeof getPersonLadder>> | null = null;
  try {
    ladder = await getPersonLadder(session.id, id);
  } catch {
    ladder = null;
  }

  const currentMinistry = detail.current?.ministryId
    ? maps.ministryById[detail.current.ministryId]
    : null;
  const currentNetwork = detail.current?.networkId
    ? maps.networkById[detail.current.networkId]
    : null;

  const pendientes: string[] = [];
  if (ladder?.consolidar.status === "in_progress") pendientes.push("Consolidar en curso");
  if (ladder?.enviar?.leadershipEligible && !ladder?.enviar?.leadershipActive) {
    pendientes.push("Ungido pendiente de activación");
  }
  if (ladder?.next.eligible) pendientes.push(`Siguiente: ${ladder.next.label}`);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title={detail.person.fullName}
        description="Vista 360° · Persona Maestra. Liderazgo pastoral ≠ rol RBAC. Ungido ≠ activo."
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={detail.person.isActive ? "Activa" : "Inactiva"}
              tone={detail.person.isActive ? "success" : "warning"}
            />
            <Link
              href="/ganar"
              className="neo-touch inline-flex items-center text-sm font-medium text-[var(--cobalt)] underline-offset-4 hover:underline"
            >
              Volver
            </Link>
          </div>
        }
      />

      <nav
        aria-label="Secciones de persona"
        className="print:hidden sticky top-0 z-10 -mx-1 overflow-x-auto bg-[var(--rice)]/95 px-1 py-2 backdrop-blur"
      >
        <ul className="flex min-w-max gap-1">
          {NAV.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="neo-touch inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--cobalt)]"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {pendientes.length > 0 ? (
        <DataCard className="space-y-2" padding="sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Pendientes
          </p>
          <ul className="list-inside list-disc text-sm text-[var(--ink)]">
            {pendientes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </DataCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <CollapsibleSection id="identidad" title="Identidad y contacto" eyebrow="Persona">
          <Dl
            items={[
              ["Teléfono", detail.person.phone ?? "—"],
              ["Dirección", detail.person.address ?? "—"],
              ["Distrito", detail.district?.name ?? "—"],
              ["Correo", detail.person.email ?? "—"],
              [
                "Ingreso",
                new Date(detail.person.registeredAt).toLocaleString("es-PE"),
              ],
              [
                "Origen",
                detail.person.source === "public_form"
                  ? "Formulario público"
                  : "Formulario interno",
              ],
            ]}
          />
        </CollapsibleSection>

        <CollapsibleSection id="pertenencia" title="Pertenencia pastoral" eyebrow="Ministerio / Red">
          <Dl
            items={[
              [
                "Ministerio",
                currentMinistry
                  ? `${currentMinistry.code} — ${currentMinistry.name}`
                  : "—",
              ],
              ["Red", currentNetwork?.name ?? "—"],
            ]}
          />
          {canSeePrayer ? (
            <div className="mt-4 space-y-1 border-t border-[var(--border)] pt-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Petición de oración
              </p>
              <p className="whitespace-pre-wrap text-sm text-[var(--ink)]">
                {detail.person.prayerRequest?.trim()
                  ? detail.person.prayerRequest
                  : "Sin petición registrada."}
              </p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/celulas" className="text-[var(--cobalt)] underline-offset-4 hover:underline">
              Ver células
            </Link>
            {canTransfers ? (
              <Link
                href="/transferencias"
                className="text-[var(--cobalt)] underline-offset-4 hover:underline"
              >
                Transferencias
              </Link>
            ) : null}
          </div>
        </CollapsibleSection>
      </div>

      <CollapsibleSection id="liderazgo" title="Liderazgo" eyebrow="Pastoral">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge
            label={
              leadership?.status === "active"
                ? "Activo"
                : leadership?.status === "eligible"
                  ? "Ungido / eligible"
                  : leadership?.status ?? "Sin liderazgo"
            }
            tone={
              leadership?.status === "active"
                ? "success"
                : leadership?.status === "eligible"
                  ? "warning"
                  : "neutral"
            }
          />
          <p className="text-sm text-[var(--muted)]">
            Elegible/ungido no cuenta para los 12. Activo requiere célula propia abierta.
          </p>
        </div>
        <Dl
          items={[
            ["Código líder", leadership?.humanLeaderCode ?? "—"],
            [
              "Activado",
              leadership?.activatedAt
                ? new Date(leadership.activatedAt).toLocaleString("es-PE")
                : "—",
            ],
          ]}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {(canMarkEligible || canActivate) && leadership?.status !== "active" ? (
            <Link
              href={`/liderazgo/activar/${id}`}
              className="neo-touch rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm font-medium text-white"
            >
              {leadership?.status === "eligible"
                ? "Activar como líder"
                : "Marcar apto / Activar"}
            </Link>
          ) : null}
          {leadership?.status === "active" ? (
            <Link
              href={`/liderazgo/${id}`}
              className="neo-touch text-sm font-medium text-[var(--cobalt)] underline-offset-4 hover:underline"
            >
              Ver estructura / Mis 12
            </Link>
          ) : null}
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="escalera" title="Escalera del Éxito" eyebrow="Proceso">
        <ul className="space-y-4 text-sm">
          <li className="flex justify-between gap-2">
            <span className="font-medium">01 Ganar</span>
            <StatusBadge label="Completado" tone="success" />
          </li>

          <li className="space-y-2">
            <div className="flex justify-between gap-2">
              <span className="font-medium">02 Consolidar</span>
              <StatusBadge
                label={ladder ? statusLabel(ladder.consolidar.status) : "—"}
                tone={ladder?.consolidar.status === "completed" ? "success" : "warning"}
              />
            </div>
            <ul className="ml-3 space-y-1 text-[var(--muted)]">
              <StageRow
                label="Pre-Encuentro"
                status={ladder?.consolidar.stages?.pre.status}
                text={ladder?.consolidar.stages?.pre.label}
              />
              <StageRow
                label="Encuentro"
                status={ladder?.consolidar.stages?.encuentro.status}
                text={ladder?.consolidar.stages?.encuentro.label}
              />
              <StageRow
                label="Post-Encuentro"
                status={ladder?.consolidar.stages?.post.status}
                text={ladder?.consolidar.stages?.post.label}
              />
            </ul>
          </li>

          <li className="space-y-2">
            <div className="flex justify-between gap-2">
              <span className="font-medium">03 Discipular</span>
              <Link href="/destino" className="text-xs text-[var(--cobalt)] underline">
                Capacitación Destino
              </Link>
            </div>
            <ul className="ml-3 space-y-1 text-[var(--muted)]">
              <StageRow
                label="Capacitación Destino 1"
                status={ladder?.discipular?.cd1.status}
                text={ladder?.discipular?.cd1.label}
              />
              <StageRow
                label="Capacitación Destino 2"
                status={ladder?.discipular?.cd2.status}
                text={ladder?.discipular?.cd2.label}
              />
              <StageRow
                label="Re-Encuentro"
                status={ladder?.discipular?.reencuentro.status}
                text={ladder?.discipular?.reencuentro.label}
              />
              <StageRow
                label="Capacitación Destino 3"
                status={ladder?.discipular?.cd3.status}
                text={ladder?.discipular?.cd3.label}
              />
              <StageRow
                label="Escuela Ministerial 1"
                status={ladder?.discipular?.em1.status}
                text={ladder?.discipular?.em1.label}
              />
              <StageRow
                label="Escuela Ministerial 2"
                status={ladder?.discipular?.em2.status}
                text={ladder?.discipular?.em2.label}
              />
              <StageRow
                label="Escuela Ministerial 3"
                status={ladder?.discipular?.em3.status}
                text={ladder?.discipular?.em3.label}
              />
            </ul>
          </li>

          <li className="space-y-1">
            <div className="flex justify-between gap-2">
              <span className="font-medium">04 Enviar</span>
              <StatusBadge
                label={ladder?.enviar?.label ?? "Pendiente"}
                tone={ladder?.enviar?.status === "completed" ? "success" : "warning"}
              />
            </div>
            <p className="ml-3 text-xs text-[var(--muted)]">
              Liderazgo:{" "}
              {ladder?.enviar?.leadershipActive
                ? "Activo"
                : ladder?.enviar?.leadershipEligible
                  ? "Ungido / eligible"
                  : (ladder?.enviar?.leadershipStatus ?? "none")}{" "}
              (separado de Enviar)
            </p>
          </li>

          <li className="flex justify-between gap-2 text-[var(--muted)]">
            <span>Siguiente etapa</span>
            <span>
              {ladder?.next.label}
              {ladder?.next.eligible ? " · apto" : ""}
            </span>
          </li>
        </ul>

        <div id="acciones" className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
          {ladder?.enviar?.status === "eligible" || ladder?.next.code === "enviar" ? (
            <Link href="/enviar" className="text-sm font-medium text-[var(--cobalt)] underline">
              Ir a Enviar
            </Link>
          ) : null}
          {canProcess &&
          detail.current?.ministryId &&
          ladder?.consolidar.status !== "completed" &&
          ladder?.consolidar.status !== "in_progress" ? (
            <form
              action={async () => {
                "use server";
                await startConsolidationAction({
                  personId: id,
                  ministryId: detail.current!.ministryId!,
                  assignedLeaderPersonId: auth.personId,
                });
              }}
            >
              <button
                type="submit"
                className="neo-touch rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm text-white"
              >
                Iniciar Consolidar
              </button>
            </form>
          ) : null}
          {canCompleteConsol && ladder?.consolidar.status === "in_progress" ? (
            <form
              action={async () => {
                "use server";
                await completeConsolidationAction({ personId: id });
              }}
            >
              <button
                type="submit"
                className="neo-touch rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
              >
                Completar Consolidar
              </button>
            </form>
          ) : null}
          {ladder?.consolidar.status === "completed" ? (
            <Link href="/destino" className="text-sm font-medium text-[var(--cobalt)] underline">
              Ir a Capacitación Destino
            </Link>
          ) : null}
          {ladder?.discipular?.cd2.status === "completed" &&
          ladder?.discipular?.reencuentro.status !== "completed" ? (
            <Link
              href="/reencuentro"
              className="text-sm font-medium text-[var(--cobalt)] underline"
            >
              Ir a Re-Encuentro
            </Link>
          ) : null}
          {ladder?.discipular?.cd3.status === "completed" ? (
            <Link
              href="/escuela-ministerial"
              className="text-sm font-medium text-[var(--cobalt)] underline"
            >
              Ir a Escuela Ministerial
            </Link>
          ) : null}
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="historial" title="Historial organizacional" defaultOpen={false}>
        {detail.history.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin historial.</p>
        ) : (
          <ul className="space-y-2">
            {detail.history.map((row) => {
              const ministry = row.ministryId ? maps.ministryById[row.ministryId] : null;
              const network = row.networkId ? maps.networkById[row.networkId] : null;
              const open = row.effectiveTo === null;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--rice)]/50 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {ministry?.code ?? "—"} · {network?.name ?? "—"}
                    </p>
                    <p className="text-[var(--muted)]">
                      Desde {new Date(row.effectiveFrom).toLocaleDateString("es-PE")}
                      {row.effectiveTo
                        ? ` · hasta ${new Date(row.effectiveTo).toLocaleDateString("es-PE")}`
                        : " · vigente"}
                      {row.changeReason ? ` · ${row.changeReason}` : ""}
                    </p>
                  </div>
                  <StatusBadge
                    label={open ? "Actual" : "Histórico"}
                    tone={open ? "success" : "neutral"}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleSection>

      {canWrite ? (
        <DataCard className="space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
            Editar datos básicos
          </h2>
          <EditPersonForm
            personId={detail.person.id}
            districts={catalogs.districts}
            initial={{
              fullName: formatFullName(detail.person.firstName, detail.person.lastName),
              phone: detail.person.phone ?? "",
              address: detail.person.address ?? "",
              districtId: detail.person.districtId ?? catalogs.districts[0]?.id ?? "",
              prayerRequest: detail.person.prayerRequest ?? "",
              email: detail.person.email ?? "",
            }}
          />
        </DataCard>
      ) : null}
    </div>
  );
}

function StageRow({
  label,
  status,
  text,
}: {
  label: string;
  status?: string;
  text?: string;
}) {
  return (
    <li className="flex justify-between gap-2">
      <span>{label}</span>
      <StatusBadge
        label={text ?? "Pendiente"}
        tone={status === "completed" ? "success" : "warning"}
      />
    </li>
  );
}

function Dl({ items }: { items: [string, string][] }) {
  return (
    <dl className="space-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-2 sm:grid-cols-[8rem_1fr]">
          <dt className="text-[var(--muted)]">{label}</dt>
          <dd className="text-[var(--ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
