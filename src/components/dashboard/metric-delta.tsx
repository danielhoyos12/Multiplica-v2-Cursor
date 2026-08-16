import { cn } from "@/lib/cn";

type MetricDeltaProps = {
  label: string;
  className?: string;
  tone?: "neutral" | "up" | "down";
};

/**
 * Textual delta / comparison label — values come from reporting (e.g. newChangeLabel).
 */
export function MetricDelta({ label, className, tone = "neutral" }: MetricDeltaProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs tabular-nums",
        tone === "up" && "text-[var(--success)]",
        tone === "down" && "text-[var(--danger)]",
        tone === "neutral" && "text-[var(--muted)]",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function deltaToneFromLabel(label: string): MetricDeltaProps["tone"] {
  if (label.startsWith("+") || label.includes("↑")) return "up";
  if (label.startsWith("-") || label.includes("↓")) return "down";
  return "neutral";
}
