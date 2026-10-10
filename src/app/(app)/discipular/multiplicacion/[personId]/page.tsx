import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DataCard, KpiCard, SectionHeader, StatGroup } from "@/components/dashboard";
import { EnrollmentPersonForm } from "@/components/formation/enrollment-person-form";
import { PageHeader } from "@/components/ui/page-header";
import { hasPermission } from "@/modules/authorization";
import {
  assignDiscipleAction,
  linkWonContactAction,
  openExpedienteAction,
  upsertContactAction,
} from "@/modules/multiplication/actions";
import {
  buildProjectionsForStudent,
  getExpedienteProgress,
} from "@/modules/multiplication";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Expediente 3–12" };

type Params = Promise<{ personId: string }>;

export default async function MultiplicacionExpedientePage({
  params,
}: {
  params: Params;
}) {
  const { personId } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "process.read") && !hasPermission(auth, "destination.read")) {
    redirect("/dashboard");
  }

  const progress = await getExpedienteProgress(session.id, personId);
  const canManage = hasPermission(auth, "destination.manage");

  if (!progress) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Expediente 3–12"
          description="Aún no hay expediente para esta Persona Maestra."
          actions={
            <Link href="/discipular/multiplicacion" className="text-sm underline">
              Volver
            </Link>
          }
        />
        {canManage ? (
          <form
            action={async () => {
              "use server";
              await openExpedienteAction({
                studentPersonId: personId,
                openedAtAcademicLevel: "cd1",
              });
            }}
          >
            <button
              type="submit"
              className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm text-white"
            >
              Abrir expediente
            </button>
          </form>
        ) : null}
      </div>
    );
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const projections = await buildProjectionsForStudent(session.id, personId, asOf);
  const occupiedSlots = new Set(progress.disciples.map((d) => d.slotIndex));
  const nextSlot =
    Array.from({ length: 12 }, (_, i) => i + 1).find((n) => !occupiedSlots.has(n)) ?? 1;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Expediente de Multiplicación"
        description="Lista de 15, equipo de 12 y proyecciones A/B/C con calendarios reales."
        actions={
          <div className="flex gap-3 text-sm">
            <Link href={`/ganar/${personId}`} className="underline">
              Persona Maestra
            </Link>
            <Link href="/discipular/multiplicacion" className="underline">
              Volver
            </Link>
          </div>
        }
      />

      <StatGroup columns={3}>
        <KpiCard
          label="Contactos listados"
          value={progress.counters.contacts.listed}
        />
        <KpiCard
          label="Ganados vinculados"
          value={progress.counters.contacts.wonLinked}
        />
        <KpiCard label="Equipo" value={progress.counters.team.teamSize} />
        <KpiCard
          label="Líderes activos + célula"
          value={progress.counters.team.activeLeadersWithCell}
        />
      </StatGroup>

      <DataCard className="space-y-3">
        <SectionHeader
          title="Lista de 15 contactos"
          description="Los contactos no son Personas Maestras hasta vincularse al ganarlas en Ganar."
        />
        {canManage ? (
          <form
            action={async (formData) => {
              "use server";
              await upsertContactAction({
                expedienteId: progress!.expediente.id,
                orderIndex: Number(formData.get("orderIndex")),
                fullName: String(formData.get("fullName") ?? ""),
                phone: String(formData.get("phone") ?? "") || undefined,
                studentPersonId: personId,
              });
            }}
            className="grid gap-2 sm:grid-cols-4"
          >
            <input
              name="orderIndex"
              type="number"
              min={1}
              max={15}
              required
              placeholder="#"
              className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              name="fullName"
              required
              placeholder="Nombre contacto"
              className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2"
            />
            <button
              type="submit"
              className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm text-white"
            >
              Guardar contacto
            </button>
          </form>
        ) : null}
        <ul className="space-y-1 text-sm">
          {progress.contacts
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {c.orderIndex}. {c.fullName}{" "}
                  <span className="text-[var(--muted)]">({c.status})</span>
                </span>
                {canManage && c.status !== "won" ? (
                  <EnrollmentPersonForm
                    label="Vincular persona ganada"
                    buttonLabel="Marcar ganado"
                    onEnroll={async (linkedPersonId) => {
                      "use server";
                      return linkWonContactAction({
                        contactId: c.id,
                        linkedPersonId,
                        studentPersonId: personId,
                      });
                    }}
                  />
                ) : null}
              </li>
            ))}
        </ul>
      </DataCard>

      <DataCard className="space-y-3">
        <SectionHeader
          title="Equipo de 12"
          description="Sin duplicar personas. Cohorte first_six / second_six. Líder activo exige célula."
        />
        {canManage ? (
          <EnrollmentPersonForm
            label={`Asignar discípulo al slot ${nextSlot}`}
            buttonLabel="Asignar al equipo"
            onEnroll={async (disciplePersonId) => {
              "use server";
              return assignDiscipleAction({
                expedienteId: progress!.expediente.id,
                personId: disciplePersonId,
                slotIndex: nextSlot,
                cohort: nextSlot <= 6 ? "first_six" : "second_six",
                origin: "assigned",
                studentPersonId: personId,
              });
            }}
          />
        ) : null}
        <ul className="space-y-1 text-sm">
          {progress.disciples
            .slice()
            .sort((a, b) => a.slotIndex - b.slotIndex)
            .map((d) => (
              <li key={d.id}>
                Slot {d.slotIndex} · {d.cohort} · {d.formationStatus}
                {d.cellId ? ` · célula ${d.cellId}` : ""} —{" "}
                <Link href={`/ganar/${d.personId}`} className="underline">
                  ver persona
                </Link>
              </li>
            ))}
        </ul>
      </DataCard>

      <DataCard className="space-y-3">
        <SectionHeader title="Proyecciones A / B / C" />
        <ul className="space-y-2 text-sm">
          {projections.map((p) => (
            <li key={p.key} className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3">
              <p className="font-medium">
                {p.key}. {p.title} — {p.status}
              </p>
              <p className="text-[var(--muted)]">{p.detail}</p>
              <ul className="mt-1 list-disc pl-5 text-[var(--muted)]">
                {p.actions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </DataCard>
    </div>
  );
}
