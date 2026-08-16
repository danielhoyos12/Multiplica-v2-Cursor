import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type StatGroupProps = {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
  "aria-label"?: string;
};

export function StatGroup({
  children,
  columns = 4,
  className,
  "aria-label": ariaLabel,
}: StatGroupProps) {
  return (
    <div
      role="list"
      aria-label={ariaLabel}
      className={cn(
        "grid gap-3",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
