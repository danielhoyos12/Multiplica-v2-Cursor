import Link from "next/link";

import { cn } from "@/lib/cn";

type BrandMarkProps = {
  compact?: boolean;
  /** Dark rail (ink sidebar) — rice/light glyph */
  inverse?: boolean;
  className?: string;
};

/**
 * Brand mark uses /public/brand/m-mark.svg (official Brand Kit drop-in path).
 * Until the kit file is provided, the SVG is a typographic M stand-in only.
 */
export function BrandMark({ compact = false, inverse = false, className }: BrandMarkProps) {
  const ink = inverse ? "#F3F0E8" : "#111111";

  return (
    <Link
      href="/dashboard"
      className={cn("group inline-flex items-center gap-2.5", className)}
      aria-label="MULTIPLICA — Inicio"
    >
      <span
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px]",
          inverse ? "bg-[rgba(243,240,232,0.12)] text-[#F3F0E8]" : "bg-[var(--ink)] text-[#F3F0E8]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/m-mark.svg" alt="" width={22} height={22} className="opacity-95" />
      </span>
      {!compact ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className="font-[family-name:var(--font-display)] text-[1.05rem] font-bold tracking-tight"
            style={{ color: ink }}
          >
            MULTIPLICA
          </span>
          <span
            className="mt-1 text-[0.62rem] font-medium uppercase tracking-[0.16em]"
            style={{ color: inverse ? "rgba(243,240,232,0.62)" : "var(--muted)" }}
          >
            Visión G12
          </span>
        </span>
      ) : null}
    </Link>
  );
}
