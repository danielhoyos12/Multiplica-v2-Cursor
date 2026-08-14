import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  emptyMessage?: string;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  emptyMessage = "Sin registros",
  className,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-4 py-8 text-sm text-[var(--muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]",
        className,
      )}
    >
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--surface-soft)] text-[var(--muted)]">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "border-b border-[var(--border)] px-4 py-3 font-medium",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowId(row)} className="bg-[var(--surface)]">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "border-b border-[var(--border)] px-4 py-3 text-[var(--ink)]",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
