import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EditPersonForm } from "@/components/ganar/edit-person-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
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
  const canSeePrayer =
    isSuperadmin(auth) || hasPermission(auth, "persons.read");

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
        description="Detalle de Persona Maestra. La Escalera del Éxito se habilitará en fases posteriores."
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
              [
                "Estado",
                detail.person.isActive ? "Activa" : "Inactiva",
              ],
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

      <section className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface-soft)] p-5">
        <h2 className="font-medium text-[var(--ink)]">Escalera del Éxito</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Placeholder técnico. Consolidar, Discipular y Enviar se implementarán en
          fases posteriores. Esta persona permanece referenciada por su UUID maestro.
        </p>
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
