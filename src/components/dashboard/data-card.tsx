import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type DataCardProps = {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  as?: "section" | "article" | "div";
};

export function DataCard({
  children,
  className,
  padding = "md",
  as: Comp = "section",
}: DataCardProps) {
  return (
    <Comp
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]",
        padding === "sm" && "p-3",
        padding === "md" && "p-4 sm:p-5",
        padding === "lg" && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
