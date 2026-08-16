import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  info: "border-[var(--border)] bg-[var(--paper-100)] text-[var(--ink-secondary)]",
  success: "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]",
  warning: "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]",
};

export function InlineNotice({
  title,
  children,
  tone = "info",
  className,
}: {
  title?: string;
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-[var(--radius-md)] border px-4 py-3 text-sm shadow-[var(--shadow-card)]",
        toneClass[tone],
        className,
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}
