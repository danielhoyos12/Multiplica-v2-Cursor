import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EnrollmentPersonForm } from "@/components/formation/enrollment-person-form";
import { GroupAttendancePanel } from "@/components/formation/group-attendance-panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission } from "@/modules/authorization";
import {
  ENCUENTRO_CODE,
  POST_ENCUENTRO_CODE,
  PRE_ENCUENTRO_CODE,
} from "@/db/schema";
import type { ConsolidarStage } from "@/modules/formation";
import { getConsolidarCycleBoard } from "@/modules/formation";
import {
  completeConsolidarStageAction,
  enrollConsolidarStageAction,
} from "@/modules/formation/actions";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Ciclo Consolidar · UDLV" };

type Params = Promise<{ cycleId: string }>;

function stageFromProgramCode(code: string | undefined): ConsolidarStage | null {
  if (code === PRE_ENCUENTRO_CODE) return "pre_encuentro";
  if (code === ENCUENTRO_CODE) return "encuentro";
  if (code === POST_ENCUENTRO_CODE) return "post_encuentro";
  return null;
}

function stageHref(stage: ConsolidarStage) {
  if (stage === "pre_encuentro") return "/proceso/pre";
  if (stage === "encuentro") return "/proceso/encuentro";
  return "/proceso/post";
}

function approveLabel(stage: ConsolidarStage) {
  if (stage === "pre_encuentro") return "Aprobar y habilitar Encuentro";
  if (stage === "encuentro") return "Aprobar y habilitar Post-Encuentro";
  return "Finalizar UDLV y habilitar CD1";
}

export default async function ConsolidarCyclePage({ params }: { params: Params }) {
  const { cycleId } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  let board;
  try {
    board = await getConsolidarCycleBoard(session.id, cycleId);
  } catch (error) {
    if (error instanceof DomainError && error.code === DomainErrorCode.NOT_FOUND) {
      notFound();
    }
    throw error;
  }

  const stage = stageFromProgramCode(board.program?.code);
  if (!stage) {
    notFound();
  }

  const canAttend =
    hasPermission(auth, "udv.attendance") || hasPermission(auth, "consolidation.manage");
  const canEnroll = hasPermission(auth, "consolidation.manage");
  const canApprove = hasPermission(auth, "consolidation.manage");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <PageHeader
        title={board.cycle.name}
        description={`${board.program?.name ?? "UDLV"} · ${String(board.cycle.startDate)} → ${String(board.cycle.endDate)}`}
        actions={
          <div className="flex gap-2">
            <Link href={stageHref(stage)} className="text-sm underline">
              Volver a etapa
            </Link>
            <StatusBadge label={board.cycle.status} tone="brand" />
          </div>
        }
      />

      {canEnroll && board.cycle.status === "active" ? (
        <EnrollmentPersonForm
          label="Persona apta (buscar por nombre o teléfono)"
          buttonLabel="Inscribir en este ciclo"
          onEnroll={async (personId) => {
            "use server";
            return enrollConsolidarStageAction({ personId, cycleId, stage });
          }}
        />
      ) : null}

      <GroupAttendancePanel
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
                attendanceDate:
                  "attendanceDate" in row ? String(row.attendanceDate ?? "") : undefined,
              },
            ]),
          ),
        }))}
        attendanceDate={today}
        canAttend={canAttend}
      />

      {canApprove ? (
        <section className="space-y-3">
          <h2 className="font-medium">Aprobación de etapa</h2>
          <p className="text-sm text-[var(--muted)]">
            Habilitar la siguiente etapa no matricula automáticamente. La aprobación queda auditada.
          </p>
          <ul className="space-y-2">
            {board.participants.map((p) => (
              <li
                key={p.enrollmentId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
              >
                <Link href={`/ganar/${p.personId}`} className="font-medium underline">
                  {p.fullName}
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await completeConsolidarStageAction({ personId: p.personId, stage });
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-[var(--radius-sm)] bg-[var(--cobalt)] px-3 py-2 text-xs text-white"
                  >
                    {approveLabel(stage)}
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
