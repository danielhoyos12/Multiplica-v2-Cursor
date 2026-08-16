"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export function CollapsibleSection({
  id,
  title,
  eyebrow,
  defaultOpen = true,
  children,
  className,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      id={id}
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <button
        type="button"
        className="neo-touch flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {eyebrow ? (
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {eyebrow}
            </span>
          ) : null}
          <span className="font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--ink)]">
            {title}
          </span>
        </span>
        <span className="text-sm text-[var(--muted)]" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div id={`${id}-panel`} className="border-t border-[var(--border)] px-4 py-4 sm:px-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
