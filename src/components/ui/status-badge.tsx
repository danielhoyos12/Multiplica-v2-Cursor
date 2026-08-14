import { cn } from "@/lib/cn";

type StatusBadgeProps = {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "brand";
  className?: string;
};

const toneClass: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  neutral: "bg-[var(--surface-soft)] text-[var(--muted)] border-[var(--border)]",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-[var(--success-border)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning-border)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger-border)]",
  brand: "bg-[var(--brand-soft)] text-[var(--brand-ink)] border-[var(--brand-border)]",
};

export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 text-xs font-medium tracking-wide",
        toneClass[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
