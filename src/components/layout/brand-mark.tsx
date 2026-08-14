import Link from "next/link";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="group inline-flex flex-col gap-0.5">
      <span className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--brand-ink)] transition-colors group-hover:text-[var(--brand)]">
        MULTIPLICA
      </span>
      {!compact ? (
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Visión G12
        </span>
      ) : null}
    </Link>
  );
}
