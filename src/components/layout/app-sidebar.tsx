"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  enabled: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Inicio", enabled: true },
  { href: "/admin/ministries", label: "Ministerios", enabled: true },
  { href: "/admin/networks", label: "Redes", enabled: true },
  { href: "/admin/users", label: "Usuarios", enabled: true },
  { href: "#", label: "Mi estructura", enabled: false },
  { href: "#", label: "Ganar", enabled: false },
  { href: "#", label: "Células", enabled: false },
  { href: "#", label: "Escuela", enabled: false },
  { href: "#", label: "Reportes", enabled: false },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          item.enabled &&
          (pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href)));

        if (!item.enabled) {
          return (
            <span
              key={item.label}
              className="cursor-not-allowed rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--muted)] opacity-55"
              title="Módulo pendiente de fase posterior"
            >
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors",
              active
                ? "bg-[var(--brand-soft)] font-medium text-[var(--brand-ink)]"
                : "text-[var(--ink)] hover:bg-[var(--surface-soft)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
