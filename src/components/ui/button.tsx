import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variantClass: Record<Variant, string> = {
  primary:
    "bg-[var(--vermilion)] text-white hover:bg-[var(--vermilion-dark)] border border-transparent",
  secondary:
    "bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] hover:border-[var(--concrete)]",
  danger:
    "bg-[var(--danger)] text-white hover:bg-[var(--vermilion-dark)] border border-transparent",
  ghost:
    "bg-transparent text-[var(--ink)] border border-transparent hover:bg-[var(--paper-100)]",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

/**
 * Neo Editorial actions — Vermilion = primary, Cobalt reserved for selection/nav.
 */
export function Button({
  variant = "primary",
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "neo-touch inline-flex items-center justify-center rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium transition-colors duration-[var(--motion-fast)] disabled:opacity-50",
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function PrimaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="primary" {...props} />;
}

export function SecondaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="secondary" {...props} />;
}

export function DangerButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="danger" {...props} />;
}
