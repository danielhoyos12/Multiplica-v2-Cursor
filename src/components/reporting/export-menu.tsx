"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { exportReportFormatAction } from "@/modules/reporting/actions";
import type { ReportType } from "@/modules/reporting";
import { cn } from "@/lib/cn";

const OPTIONS = [
  { format: "csv" as const, label: "CSV" },
  { format: "xlsx" as const, label: "Excel (.xlsx)" },
  { format: "pdf" as const, label: "PDF" },
  { format: "print" as const, label: "Imprimir" },
];

function downloadBase64(base64: string, filename: string, mime: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openPrintHtml(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) {
    win.addEventListener("load", () => {
      try {
        win.focus();
        win.print();
      } catch {
        /* user can print manually */
      }
    });
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ExportMenu({
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
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(format: (typeof OPTIONS)[number]["format"]) {
    setError(null);
    setOpen(false);
    start(async () => {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("format", format);
      fd.set("ministryId", ministryId);
      fd.set("networkId", networkId);
      fd.set("rootPersonId", rootPersonId);
      const res = await exportReportFormatAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.format === "csv") {
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `multiplica-${type}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (res.format === "xlsx") {
        downloadBase64(
          res.base64,
          res.filename,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        return;
      }
      openPrintHtml(res.html);
    });
  }

  return (
    <div className="relative flex flex-col items-end gap-1" ref={rootRef}>
      <button
        type="button"
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={cn(
          "neo-touch inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-4 py-2 text-sm font-medium text-white",
          "hover:bg-[var(--vermilion-dark)] disabled:opacity-50",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        {pending ? "Exportando…" : "Exportar"}
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label="Opciones de exportación"
          className="absolute right-0 top-full z-20 mt-1 min-w-[12rem] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-float)]"
        >
          {OPTIONS.map((opt) => (
            <li key={opt.format} role="none">
              <button
                type="button"
                role="menuitem"
                className="neo-touch block w-full px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--cobalt-soft)]"
                onClick={() => run(opt.format)}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ExportCsvButton(props: {
  type: ReportType;
  ministryId: string;
  networkId: string;
  rootPersonId: string;
}) {
  return <ExportMenu {...props} />;
}
