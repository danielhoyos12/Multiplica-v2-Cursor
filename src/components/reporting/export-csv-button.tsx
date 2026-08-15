"use client";

import { useState, useTransition } from "react";

import { exportReportAction } from "@/modules/reporting/actions";
import type { ReportType } from "@/modules/reporting";

export function ExportCsvButton({
  type,
  ministryId,
  networkId,
  rootPersonId,
}: {
  type: ReportType;
  ministryId: string;
  networkId: string;
  rootPersonId: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
        onClick={() => {
          setError(null);
          start(async () => {
            const fd = new FormData();
            fd.set("type", type);
            fd.set("ministryId", ministryId);
            fd.set("networkId", networkId);
            fd.set("rootPersonId", rootPersonId);
            const res = await exportReportAction(fd);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `multiplica-${type}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          });
        }}
      >
        {pending ? "Exportando…" : "Exportar CSV"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
