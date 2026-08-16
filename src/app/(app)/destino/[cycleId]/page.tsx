import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EnrollmentPersonForm } from "@/components/formation/enrollment-person-form";
import { UdvAttendanceBoard } from "@/components/formation/udv-attendance-board";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission } from "@/modules/authorization";
import { getDestinoCycleBoard } from "@/modules/formation";
import {
  completeDestinoLevelAction,
  enrollDestinoAction,
  markAcademicCompletedAction,
} from "@/modules/formation/actions";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Ciclo Capacitación Destino" };

type Params = Promise<{ cycleId: string }>;

export default async function DestinoCyclePage({ params }: { params: Params }) {
  const { cycleId } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "destination.read") && !hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  let board;
  try {
    board = await getDestinoCycleBoard(session.id, cycleId);
  } catch (error) {
    if (error instanceof DomainError && error.code === DomainErrorCode.NOT_FOUND) {
      notFound();
    }
    throw error;
  }

  const level = (board.program?.level ?? 1) as 1 | 2 | 3;
  const canAttend =
    hasPermission(auth, "destination.attendance") || hasPermission(auth, "udv.attendance");
  const canManage = hasPermission(auth, "destination.manage");
  const canAcademic = hasPermission(auth, "destination.complete_academic");
  const canComplete = hasPermission(auth, "destination.complete_level");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <PageHeader
        title={board.cycle.name}
        description={`Capacitación Destino · ${board.program?.name ?? "Nivel"} · ${String(board.cycle.startDate)} → ${String(board.cycle.endDate)}`}
        actions={
          <div className="flex gap-2">
            <Link href="/destino" className="text-sm underline">
              Volver
            </Link>
            <StatusBadge label={board.cycle.status} tone="brand" />
          </div>
        }
      />

      {canManage && board.cycle.status === "active" ? (
        <EnrollmentPersonForm
          label="Persona apta (buscar por nombre o teléfono)"
          buttonLabel={`Inscribir Nivel ${level}`}
          onEnroll={async (personId) => {
            "use server";
            return enrollDestinoAction({ personId, cycleId, level });
          }}
        />
      ) : null}

      <UdvAttendanceBoard
        cycleId={cycleId}
        modules={board.modules.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
        }))}
        participants={board.participants.map((p) => ({
          enrollmentId: p.enrollmentId,
          personId: p.personId,
          fullName: p.fullName,
          status: p.status,
          attendance: Object.fromEntries(
            Object.entries(p.attendance).map(([moduleId, row]) => [
              moduleId,
              { id: row.id, status: row.status },
            ]),
          ),
        }))}
        attendanceDate={today}
        canAttend={canAttend}
        canComplete={canManage}
      />

      <section className="space-y-3">
        <h2 className="font-medium">Avance académico / pastoral</h2>
        <p className="text-sm text-[var(--muted)]">
          Académico y pastoral son independientes. Completar el nivel NO activa liderazgo ni abre
          célula. 12 personas = memberships activas, no 12 líderes G12.
        </p>
        <ul className="space-y-2">
          {board.participants.map((p) => (
            <li
              key={p.enrollmentId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
            >
              <div>
                <Link href={`/ganar/${p.personId}`} className="font-medium underline">
                  {p.fullName}
                </Link>
                <p className="text-[var(--muted)]">
                  {p.status}
                  {p.memberCount !== null ? ` · Célula ${p.memberCount}/12` : ""}
                  {p.pastoralPending ? " · Pendiente pastoral" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAcademic && p.status !== "completed" && p.status !== "academic_completed" ? (
                  <form
                    action={async () => {
                      "use server";
                      await markAcademicCompletedAction({
                        personId: p.personId,
                        level,
                        enrollmentId: p.enrollmentId,
                      });
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs"
                    >
                      Académico OK
                    </button>
                  </form>
                ) : null}
                {canComplete && p.status !== "completed" ? (
                  <form
                    action={async () => {
                      "use server";
                      await completeDestinoLevelAction({
                        personId: p.personId,
                        level,
                      });
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-2 py-1 text-xs text-white"
                    >
                      Completar nivel
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
