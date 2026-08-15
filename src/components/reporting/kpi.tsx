import { cn } from "@/lib/cn";

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "critical" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3",
        tone === "warning" && "border-amber-500/40",
        tone === "critical" && "border-red-500/50",
        tone === "success" && "border-emerald-500/40",
      )}
    >
      <p className="text-2xl font-semibold tabular-nums text-[var(--ink)]">{value}</p>
      <p className="text-sm text-[var(--muted)]">{label}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function SimpleBarChart({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <figure className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <figcaption className="mb-3 text-sm font-medium text-[var(--ink)]">{title}</figcaption>
      <ul className="space-y-2" aria-label={title}>
        {items.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">Sin datos en el período.</li>
        ) : (
          items.map((item) => (
            <li key={item.label} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-sm">
              <span className="truncate text-[var(--muted)]">{item.label}</span>
              <div
                className="h-3 rounded-sm bg-[var(--brand)]/20"
                role="img"
                aria-label={`${item.label}: ${item.value}`}
              >
                <div
                  className="h-3 rounded-sm bg-[var(--brand)]"
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
              <span className="text-right tabular-nums text-[var(--ink)]">{item.value}</span>
            </li>
          ))
        )}
      </ul>
    </figure>
  );
}

export function FunnelList({
  items,
}: {
  items: Array<{ code: string; label: string; count: number }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ol className="space-y-2" aria-label="Embudo Escalera del Éxito">
      {items.map((item, idx) => (
        <li key={item.code} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{item.label}</span>
            <span className="tabular-nums">{item.count}</span>
          </div>
          <div className="h-2 rounded-sm bg-[var(--brand)]/15">
            <div
              className="h-2 rounded-sm bg-[var(--brand)]"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          {idx < items.length - 1 ? (
            <p className="text-center text-xs text-[var(--muted)]">↓</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
