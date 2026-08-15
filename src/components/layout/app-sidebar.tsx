"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  enabled: boolean;
  group: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Inicio", enabled: true, group: "Principal" },
  { href: "/ganar", label: "Personas / Ganar", enabled: true, group: "Principal" },
  { href: "/celulas", label: "Células", enabled: true, group: "Principal" },
  { href: "/liderazgo", label: "Liderazgo", enabled: true, group: "Principal" },
  { href: "/proceso", label: "Proceso / Escalera", enabled: true, group: "Proceso" },
  { href: "/destino", label: "Destino", enabled: true, group: "Proceso" },
  { href: "/reencuentro", label: "Re-Encuentro", enabled: true, group: "Proceso" },
  { href: "/escuela-ministerial", label: "Escuela Min.", enabled: true, group: "Proceso" },
  { href: "/enviar", label: "Enviar", enabled: true, group: "Proceso" },
  { href: "/transferencias", label: "Transferencias", enabled: true, group: "Operación" },
  { href: "/reportes", label: "Reportes", enabled: true, group: "Operación" },
  { href: "/admin/ministries", label: "Ministerios", enabled: true, group: "Admin" },
  { href: "/admin/networks", label: "Redes", enabled: true, group: "Admin" },
  { href: "/admin/users", label: "Usuarios", enabled: true, group: "Admin" },
  { href: "/admin/system-health", label: "System health", enabled: true, group: "Admin" },
  { href: "/udv", label: "UDV (legacy)", enabled: true, group: "Legacy" },
];

const GROUPS = ["Principal", "Proceso", "Operación", "Admin", "Legacy"] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {GROUPS.map((group) => {
        const items = NAV_ITEMS.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] first:mt-0">
              {group}
            </p>
            {items.map((item) => {
              const active =
                item.enabled &&
                (pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href)));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-[var(--brand-soft)] font-medium text-[var(--brand-ink)]"
                      : "text-[var(--ink)] hover:bg-[var(--surface-soft)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
