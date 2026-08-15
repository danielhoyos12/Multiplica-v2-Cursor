import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { UdvAttendanceBoard } from "@/components/formation/udv-attendance-board";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission } from "@/modules/authorization";
import { getEmCycleBoard } from "@/modules/formation";
import {
  completeEmAction,
  enrollEmAction,
  markEmAcademicAction,
} from "@/modules/formation/actions";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Ciclo Escuela Ministerial" };

type Params = Promise<{ cycleId: string }>;

export default async function EmCyclePage({ params }: { params: Params }) {
  const { cycleId } = await params;
  const { session, auth } = await requireAppActor();
  if (
    !hasPermission(auth, "ministerial_school.read") &&
    !hasPermission(auth, "process.read")
  ) {
    redirect("/dashboard");
  }

  let board;
  try {
    board = await getEmCycleBoard(session.id, cycleId);
  } catch (error) {
    if (error instanceof DomainError && error.code === DomainErrorCode.NOT_FOUND) {
      notFound();
    }
    throw error;
  }

  const canAttend =
    hasPermission(auth, "ministerial_school.attendance") ||
    hasPermission(auth, "udv.attendance");
  const canManage = hasPermission(auth, "ministerial_school.manage");
  const canComplete = hasPermission(auth, "ministerial_school.complete");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <PageHeader
        title={board.cycle.name}
        description={`${board.program?.name ?? "EM"} · ${String(board.cycle.startDate)} → ${String(board.cycle.endDate)}`}
        actions={
          <div className="flex gap-2">
            <Link href="/escuela-ministerial" className="text-sm underline">
              Volver
            </Link>
            <StatusBadge label={board.cycle.status} tone="brand" />
          </div>
        }
      />

      {canManage && board.cycle.status === "active" ? (
        <form
          action={async (formData) => {
            "use server";
            await enrollEmAction({
              personId: String(formData.get("personId") ?? ""),
              cycleId,
            });
          }}
          className="flex flex-wrap gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4 text-sm"
        >
          <input
            name="personId"
            required
            placeholder="UUID persona apta (Destino N3 completado)"
            className="min-w-[16rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-white"
          >
            Inscribir
          </button>
        </form>
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
        <h2 className="font-medium">Avance</h2>
        <p className="text-sm text-[var(--muted)]">
          Académico ≠ formal. Completar EM no activa liderazgo.
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
                <p className="text-[var(--muted)]">{p.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canComplete &&
                p.status !== "completed" &&
                p.status !== "academic_completed" ? (
                  <form
                    action={async () => {
                      "use server";
                      await markEmAcademicAction({
                        personId: p.personId,
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
                      await completeEmAction({ personId: p.personId });
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-2 py-1 text-xs text-white"
                    >
                      Completar EM
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
