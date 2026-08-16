import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import type { AlertSeverity } from "@/modules/reporting/alerts";

type AlertCardProps = {
  code: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href?: string;
  className?: string;
};

const severityUi: Record<
  AlertSeverity,
  { label: string; tone: "danger" | "warning" | "neutral"; icon: string }
> = {
  critical: { label: "Alta", tone: "danger", icon: "!" },
  warning: { label: "Media", tone: "warning", icon: "▲" },
  info: { label: "Info", tone: "neutral", icon: "i" },
};

export function AlertCard({
  code,
  severity,
  title,
  detail,
  href,
  className,
}: AlertCardProps) {
  const ui = severityUi[severity];
  return (
    <article
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-md)] border bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)]",
        severity === "critical" && "border-[var(--danger-border)]",
        severity === "warning" && "border-[var(--warning-border)]",
        severity === "info" && "border-[var(--border)]",
        className,
      )}
      data-alert-code={code}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] font-[family-name:var(--font-display)] text-sm font-semibold",
            severity === "critical" && "bg-[var(--vermilion-soft)] text-[var(--vermilion)]",
            severity === "warning" && "bg-[var(--warning-soft)] text-[var(--warning)]",
            severity === "info" && "bg-[var(--paper-100)] text-[var(--ink-secondary)]",
          )}
        >
          {ui.icon}
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={ui.label} tone={ui.tone} />
            <span className="sr-only">Severidad {ui.label}</span>
          </div>
          <h3 className="font-medium text-[var(--ink)]">{title}</h3>
          <p className="text-sm text-[var(--muted)]">{detail}</p>
        </div>
      </div>
      {href ? (
        <Link
          href={href}
          className="neo-touch inline-flex items-center text-sm font-medium text-[var(--cobalt)] underline-offset-4 hover:underline"
        >
          Ver
        </Link>
      ) : null}
    </article>
  );
}
