import { cn } from "@/lib/cn";

type ProgressBarProps = {
  value: number;
  max?: number;
  label: string;
  showValue?: boolean;
  tone?: "cobalt" | "vermilion" | "ink";
  className?: string;
};

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  tone = "cobalt",
  className,
}: ProgressBarProps) {
  const safeMax = Math.max(1, max);
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const fill =
    tone === "vermilion"
      ? "bg-[var(--vermilion)]"
      : tone === "ink"
        ? "bg-[var(--ink)]"
        : "bg-[var(--cobalt)]";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-[var(--muted)]">{label}</span>
        {showValue ? (
          <span className="font-[family-name:var(--font-display)] tabular-nums text-[var(--ink)]">
            {value}
            {max !== 100 ? (
              <span className="text-[var(--muted)]">/{max}</span>
            ) : (
              <span className="text-[var(--muted)]">%</span>
            )}
          </span>
        ) : null}
      </div>
      <div
        className="h-2 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--paper-100)]"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-[var(--radius-sm)] transition-[width] duration-[var(--motion-base)] ease-[var(--ease-editorial)]", fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
