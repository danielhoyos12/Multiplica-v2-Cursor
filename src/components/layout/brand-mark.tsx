import Link from "next/link";

import { cn } from "@/lib/cn";

type BrandMarkProps = {
  /** Monogram only (sidebar rail) */
  compact?: boolean;
  /** Ink / dark surface — use official negative assets */
  inverse?: boolean;
  /** Prefer full official wordmark when not compact */
  showWordmark?: boolean;
  className?: string;
};

/**
 * Official MULTIPLICA Brand Kit assets (no typographic stand-in).
 *
 * - Monogram light: `/brand/m-mark.svg` ← MULTIPLICA-M.svg
 * - Monogram dark: `/brand/m-mark-negative.svg` ← same geometry, white fill
 * - Wordmark light: `/brand/wordmark-positive.svg` ← paths from MULTIPLICA-negative.svg
 * - Wordmark dark: `/brand/wordmark-negative-glyph.svg` ← MULTIPLICA-negative.svg without plate
 */
export function BrandMark({
  compact = false,
  inverse = false,
  showWordmark = !compact,
  className,
}: BrandMarkProps) {
  const monogramSrc = inverse ? "/brand/m-mark-negative.svg" : "/brand/m-mark.svg";
  const wordmarkSrc = inverse
    ? "/brand/wordmark-negative-glyph.svg"
    : "/brand/wordmark-positive.svg";

  return (
    <Link
      href="/dashboard"
      className={cn("group inline-flex items-center gap-2.5", className)}
      aria-label="MULTIPLICA — Inicio"
    >
      {showWordmark && !compact ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={wordmarkSrc}
          alt="MULTIPLICA"
          height={28}
          width={156}
          className="h-7 w-auto max-w-[11.5rem] object-contain object-left"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={monogramSrc}
          alt=""
          width={28}
          height={28}
          className="size-7 object-contain"
        />
      )}
      {!showWordmark && !compact ? (
        <span
          className={cn(
            "font-[family-name:var(--font-display)] text-[1.05rem] font-bold tracking-tight",
            inverse ? "text-[#F3F0E8]" : "text-[var(--ink)]",
          )}
        >
          MULTIPLICA
        </span>
      ) : null}
    </Link>
  );
}
