import { cn } from "@/lib/cn";

type LoadingStateProps = {
  label?: string;
  className?: string;
};

export function LoadingState({ label = "Cargando…", className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--muted)]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block size-4 animate-pulse rounded-full bg-[var(--brand)]"
        aria-hidden
      />
      {label}
    </div>
  );
}
