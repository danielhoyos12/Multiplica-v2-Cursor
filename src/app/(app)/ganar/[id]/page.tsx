import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EditPersonForm } from "@/components/ganar/edit-person-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDb } from "@/db/client";
import { personLeadership } from "@/db/schema";
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

export const metadata = { title: "Persona · GANAR" };

type Params = Promise<{ id: string }>;

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

  const [leadership] = await getDb()
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, id))
    .limit(1);

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

  return (
    <div className="space-y-10">
      <PageHeader
        title={detail.person.fullName}
        description="Detalle de Persona Maestra. Liderazgo pastoral es independiente del rol RBAC."
        actions={
          <Link href="/ganar" className="text-sm font-medium underline">
            Volver
          </Link>
        }
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-medium text-[var(--ink)]">Datos personales</h2>
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
              ["Estado", detail.person.isActive ? "Activa" : "Inactiva"],
            ]}
          />
        </div>

        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-medium text-[var(--ink)]">Pertenencia actual</h2>
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
            <div className="space-y-1 border-t border-[var(--border)] pt-4">
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
        </div>
      </section>

      <section className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-[var(--ink)]">Liderazgo pastoral</h2>
          <StatusBadge
            label={leadership?.status ?? "none"}
            tone={
              leadership?.status === "active"
                ? "success"
                : leadership?.status === "eligible"
                  ? "warning"
                  : "brand"
            }
          />
        </div>
        <p className="text-sm text-[var(--muted)]">
          Elegible/ungido no cuenta para los 12. Activo requiere célula propia abierta.
        </p>
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
        <div className="flex flex-wrap gap-2 pt-2">
          {(canMarkEligible || canActivate) && leadership?.status !== "active" ? (
            <Link
              href={`/liderazgo/activar/${id}`}
              className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white"
            >
              {leadership?.status === "eligible"
                ? "Activar como líder"
                : "Marcar apto / Activar"}
            </Link>
          ) : null}
          {leadership?.status === "active" ? (
            <Link href={`/liderazgo/${id}`} className="text-sm font-medium underline">
              Ver estructura
            </Link>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Historial organizacional</h2>
        {detail.history.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin historial.</p>
        ) : (
          <ul className="space-y-2">
            {detail.history.map((row) => {
              const ministry = row.ministryId
                ? maps.ministryById[row.ministryId]
                : null;
              const network = row.networkId ? maps.networkById[row.networkId] : null;
              const open = row.effectiveTo === null;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {ministry?.code ?? "—"} · {network?.name ?? "—"}
                    </p>
                    <p className="text-[var(--muted)]">
                      Desde{" "}
                      {new Date(row.effectiveFrom).toLocaleDateString("es-PE")}
                      {row.effectiveTo
                        ? ` · hasta ${new Date(row.effectiveTo).toLocaleDateString("es-PE")}`
                        : " · vigente"}
                      {row.changeReason ? ` · ${row.changeReason}` : ""}
                    </p>
                  </div>
                  <StatusBadge
                    label={open ? "Actual" : "Histórico"}
                    tone={open ? "success" : "warning"}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-medium text-[var(--ink)]">Escalera del Éxito</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between gap-2">
            <span>GANAR</span>
            <StatusBadge label="Completado" tone="success" />
          </li>
          <li className="flex justify-between gap-2">
            <span>CONSOLIDAR</span>
            <StatusBadge
              label={ladder ? statusLabel(ladder.consolidar.status) : "—"}
              tone={ladder?.consolidar.status === "completed" ? "success" : "warning"}
            />
          </li>
          <li className="flex justify-between gap-2">
            <span>UNIVERSIDAD DE LA VIDA</span>
            <StatusBadge
              label={ladder ? statusLabel(ladder.udv.status) : "—"}
              tone={ladder?.udv.status === "completed" ? "success" : "warning"}
            />
          </li>
          <li className="space-y-1">
            <div className="flex justify-between gap-2">
              <span>CAPACITACIÓN DESTINO</span>
              <Link href="/destino" className="text-xs underline">
                Ver
              </Link>
            </div>
            <ul className="ml-2 space-y-1 text-[var(--muted)]">
              <li className="flex justify-between gap-2">
                <span>Nivel 1</span>
                <StatusBadge
                  label={ladder?.destino?.n1.label ?? "Pendiente"}
                  tone={ladder?.destino?.n1.status === "completed" ? "success" : "warning"}
                />
              </li>
              <li className="flex justify-between gap-2">
                <span>Nivel 2</span>
                <StatusBadge
                  label={ladder?.destino?.n2.label ?? "Pendiente"}
                  tone={ladder?.destino?.n2.status === "completed" ? "success" : "warning"}
                />
              </li>
              <li className="flex justify-between gap-2">
                <span>Nivel 3</span>
                <StatusBadge
                  label={ladder?.destino?.n3.label ?? "Pendiente"}
                  tone={ladder?.destino?.n3.status === "completed" ? "success" : "warning"}
                />
              </li>
            </ul>
          </li>
          <li className="flex justify-between gap-2 text-[var(--muted)]">
            <span>Siguiente etapa</span>
            <span>
              {ladder?.next.label}
              {ladder?.next.eligible ? " · apto" : ""}
            </span>
          </li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-2">
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
                className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-sm text-white"
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
                className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
              >
                Completar Consolidar
              </button>
            </form>
          ) : null}
          {ladder?.udv.eligible ? (
            <Link href="/udv" className="text-sm font-medium underline">
              Ir a Universidad de la Vida
            </Link>
          ) : null}
          {ladder?.udv.status === "completed" ? (
            <Link href="/destino" className="text-sm font-medium underline">
              Ir a Capacitación Destino
            </Link>
          ) : null}
        </div>
      </section>

      {canWrite ? (
        <section className="space-y-4">
          <h2 className="font-medium">Editar datos básicos</h2>
          <EditPersonForm
            personId={detail.person.id}
            districts={catalogs.districts}
            initial={{
              fullName: formatFullName(
                detail.person.firstName,
                detail.person.lastName,
              ),
              phone: detail.person.phone ?? "",
              address: detail.person.address ?? "",
              districtId: detail.person.districtId ?? catalogs.districts[0]?.id ?? "",
              prayerRequest: detail.person.prayerRequest ?? "",
              email: detail.person.email ?? "",
            }}
          />
        </section>
      ) : null}
    </div>
  );
}

function Dl({ items }: { items: [string, string][] }) {
  return (
    <dl className="space-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[8rem_1fr] gap-2">
          <dt className="text-[var(--muted)]">{label}</dt>
          <dd className="text-[var(--ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
