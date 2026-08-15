import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { UdvAttendanceBoard } from "@/components/formation/udv-attendance-board";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission } from "@/modules/authorization";
import { getUdvCycleBoard } from "@/modules/formation";
import {
  completeUdvAction,
  enrollUdvAction,
} from "@/modules/formation/actions";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Ciclo UDV" };

type Params = Promise<{ cycleId: string }>;

export default async function UdvCyclePage({ params }: { params: Params }) {
  const { cycleId } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "udv.read")) {
    redirect("/dashboard");
  }

  let board;
  try {
    board = await getUdvCycleBoard(session.id, cycleId);
  } catch (error) {
    if (error instanceof DomainError && error.code === DomainErrorCode.NOT_FOUND) {
      notFound();
    }
    throw error;
  }

  const canAttend = hasPermission(auth, "udv.attendance");
  const canManage = hasPermission(auth, "udv.manage");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <PageHeader
        title={board.cycle.name}
        description={`${String(board.cycle.startDate)} → ${String(board.cycle.endDate)}`}
        actions={
          <div className="flex gap-2">
            <Link href="/udv" className="text-sm underline">
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
            await enrollUdvAction({
              personId: String(formData.get("personId") ?? ""),
              cycleId,
            });
          }}
          className="flex flex-wrap gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4 text-sm"
        >
          <input
            name="personId"
            required
            placeholder="UUID persona apta (Consolidar completado)"
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
              {
                id: row.id,
                status: row.status,
              },
            ]),
          ),
        }))}
        attendanceDate={today}
        canAttend={canAttend}
        canComplete={canManage}
      />

      {canManage ? (
        <section className="space-y-2">
          <h2 className="font-medium">Completar UDV (explícito)</h2>
          <p className="text-sm text-[var(--muted)]">
            Completar NO activa liderazgo ni abre célula. UDV es catálogo legacy y no habilita CD1
            (CD1 requiere Consolidar completado: Pre + Encuentro + Post).
          </p>
          <ul className="space-y-2">
            {board.participants
              .filter((p) => p.status !== "completed")
              .map((p) => (
                <li key={p.enrollmentId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{p.fullName}</span>
                  <form
                    action={async () => {
                      "use server";
                      await completeUdvAction({ personId: p.personId });
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1"
                    >
                      Completar
                    </button>
                  </form>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
