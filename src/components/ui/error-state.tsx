import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type ErrorStateProps = {
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({
  title = "Algo salió mal",
  message,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-5 py-6",
        className,
      )}
      role="alert"
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--danger)]">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-[var(--ink)]">{message}</p>
      {action}
    </div>
  );
}
