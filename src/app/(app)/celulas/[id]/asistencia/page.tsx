import Link from "next/link";
import { redirect } from "next/navigation";

import { AttendanceBoard } from "@/components/cells/attendance-board";
import { hasPermission } from "@/modules/authorization";
import { getAttendanceBoard } from "@/modules/cells";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Asistencia" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function AsistenciaPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "cells.attendance")) {
    redirect(`/celulas/${id}`);
  }

  const sessionDate =
    one(sp.date) && /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)!)
      ? one(sp.date)!
      : new Date().toISOString().slice(0, 10);

  const board = await getAttendanceBoard(session.id, id, sessionDate);
  const initialStatuses: Record<string, "present" | "absent" | "excused"> = {};
  for (const [personId, row] of Object.entries(board.byPerson)) {
    initialStatuses[personId] = row.status;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/celulas/${id}`} className="text-sm font-medium underline">
          Volver a la célula
        </Link>
        <form className="flex items-center gap-2 text-sm" method="get">
          <label htmlFor="date">Fecha</label>
          <input
            id="date"
            type="date"
            name="date"
            defaultValue={sessionDate}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1"
          />
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] bg-[var(--brand-ink)] px-3 py-1 text-white"
          >
            Abrir
          </button>
        </form>
      </div>

      <AttendanceBoard
        cellId={id}
        cellName={board.cell.name}
        sessionDate={sessionDate}
        members={board.activeMembers.map((m) => ({
          membershipId: m.membershipId,
          personId: m.personId,
          fullName: m.fullName,
        }))}
        initialStatuses={initialStatuses}
      />
    </div>
  );
}
