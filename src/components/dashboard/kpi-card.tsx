import { cn } from "@/lib/cn";

import { MetricDelta, deltaToneFromLabel } from "./metric-delta";

type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  delta?: string;
  tone?: "default" | "warning" | "critical" | "success";
  className?: string;
};

/**
 * Neo Editorial KPI — Archivo numbers, Inter labels, shadow-card.
 * Refined from reporting/kpi; same semantic contract.
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  tone = "default",
  className,
}: KpiCardProps) {
  return (
    <div
      role="listitem"
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 shadow-[var(--shadow-card)]",
        tone === "warning" && "border-[var(--warning-border)]",
        tone === "critical" && "border-[var(--danger-border)]",
        tone === "success" && "border-[var(--success-border)]",
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-[family-name:var(--font-display)] text-3xl tracking-tight tabular-nums text-[var(--ink)] sm:text-4xl",
          value === "NO_DATA" && "text-2xl text-[var(--muted)] sm:text-3xl",
        )}
      >
        {value}
      </p>
      {delta ? (
        <div className="mt-2">
          <MetricDelta label={delta} tone={deltaToneFromLabel(delta)} />
        </div>
      ) : null}
      {hint ? <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function MiniBarChart({
  title,
  items,
  className,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <figure
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-5",
        className,
      )}
    >
      <figcaption className="mb-4 font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--ink)]">
        {title}
      </figcaption>
      <ul className="space-y-3" aria-label={title}>
        {items.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">Sin datos en el período.</li>
        ) : (
          items.map((item) => (
            <li
              key={item.label}
              className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-sm sm:grid-cols-[7rem_1fr_3rem]"
            >
              <span className="truncate text-[var(--muted)]">{item.label}</span>
              <div
                className="h-2.5 rounded-[var(--radius-sm)] bg-[var(--cobalt-soft)]"
                role="img"
                aria-label={`${item.label}: ${item.value}`}
              >
                <div
                  className="h-2.5 rounded-[var(--radius-sm)] bg-[var(--cobalt)] transition-[width] duration-[var(--motion-base)] ease-[var(--ease-editorial)]"
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
              <span className="text-right font-[family-name:var(--font-display)] tabular-nums text-[var(--ink)]">
                {item.value}
              </span>
            </li>
          ))
        )}
      </ul>
    </figure>
  );
}

/** @deprecated Prefer LadderVisualizer; kept for any residual funnel uses. */
export function FunnelList({
  items,
}: {
  items: Array<{ code: string; label: string; count: number }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ol className="space-y-2" aria-label="Embudo Escalera del Éxito">
      {items.map((item) => (
        <li key={item.code} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{item.label}</span>
            <span className="tabular-nums">{item.count}</span>
          </div>
          <div className="h-2 rounded-sm bg-[var(--cobalt-soft)]">
            <div
              className="h-2 rounded-sm bg-[var(--cobalt)]"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Alias for callers still importing SimpleBarChart */
export const SimpleBarChart = MiniBarChart;
