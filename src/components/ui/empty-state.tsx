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
        "flex flex-col items-start gap-3 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface-soft)] px-6 py-10",
        className,
      )}
    >
      <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
        {title}
      </h2>
      {description ? (
        <p className="max-w-lg text-sm leading-relaxed text-[var(--muted)]">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
