import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission } from "@/modules/authorization";
import { getReencuentroEventBoard } from "@/modules/formation";
import {
  completeReencuentroAction,
  enrollReencuentroAction,
  recordReencuentroAttendanceAction,
} from "@/modules/formation/actions";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Evento Re-Encuentro" };

type Params = Promise<{ cycleId: string }>;

export default async function ReencuentroEventPage({ params }: { params: Params }) {
  const { cycleId } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "reencounter.read") && !hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  let board;
  try {
    board = await getReencuentroEventBoard(session.id, cycleId);
  } catch (error) {
    if (error instanceof DomainError && error.code === DomainErrorCode.NOT_FOUND) {
      notFound();
    }
    throw error;
  }

  const canManage = hasPermission(auth, "reencounter.manage");
  const canAttend = hasPermission(auth, "reencounter.attendance") || canManage;
  const canComplete = hasPermission(auth, "reencounter.complete");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <PageHeader
        title={board.cycle.name}
        description={`${String(board.cycle.startDate)} → ${String(board.cycle.endDate)} · módulo único RE-EVENT`}
        actions={
          <div className="flex gap-2">
            <Link href="/reencuentro" className="text-sm underline">
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
            await enrollReencuentroAction({
              personId: String(formData.get("personId") ?? ""),
              cycleId,
            });
          }}
          className="flex flex-wrap gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4 text-sm"
        >
          <input
            name="personId"
            required
            placeholder="UUID persona apta (EM completada)"
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

      <section className="space-y-3">
        <h2 className="font-medium">Participantes</h2>
        <ul className="space-y-2">
          {board.participants.map((p) => (
            <li
              key={p.enrollmentId}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/ganar/${p.personId}`} className="font-medium underline">
                    {p.fullName}
                  </Link>
                  <p className="text-[var(--muted)]">
                    {p.status}
                    {p.attendanceStatus ? ` · Asistencia: ${p.attendanceStatus}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canAttend && board.cycle.status === "active" ? (
                    <>
                      <form
                        action={async () => {
                          "use server";
                          await recordReencuentroAttendanceAction({
                            enrollmentId: p.enrollmentId,
                            status: "present",
                            attendanceDate: today,
                          });
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs"
                        >
                          Asistió
                        </button>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          await recordReencuentroAttendanceAction({
                            enrollmentId: p.enrollmentId,
                            status: "absent",
                            attendanceDate: today,
                          });
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs"
                        >
                          No asistió
                        </button>
                      </form>
                    </>
                  ) : null}
                  {canComplete && p.status !== "completed" ? (
                    <form
                      action={async () => {
                        "use server";
                        await completeReencuentroAction({
                          personId: p.personId,
                          enrollmentId: p.enrollmentId,
                        });
                      }}
                    >
                      <button
                        type="submit"
                        className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-2 py-1 text-xs text-white"
                      >
                        Completar
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
          {board.participants.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sin inscritos.</p>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
