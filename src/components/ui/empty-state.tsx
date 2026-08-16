import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
        Sin datos
      </p>
      <h2 className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]">
        {title}
      </h2>
      {description ? (
        <p className="max-w-lg text-sm leading-relaxed text-[var(--muted)]">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
