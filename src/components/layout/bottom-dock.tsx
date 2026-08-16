"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ESCALERA_STEPS,
  SECONDARY_GROUPS,
  pathMatches,
} from "@/components/layout/nav-config";
import {
  IconHome,
  IconMore,
  IconPeople,
  IconRoute,
  IconTeams,
} from "@/components/layout/nav-icons";
import { cn } from "@/lib/cn";

type SheetId = "ruta" | "equipos" | "mas" | null;

type Props = {
  userEmail?: string | null;
  signOutAction?: () => Promise<void>;
};

export function BottomDock({ userEmail, signOutAction }: Props) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<SheetId>(null);
  const [sheetForPath, setSheetForPath] = useState(pathname);

  if (sheetForPath !== pathname) {
    setSheetForPath(pathname);
    setSheet(null);
  }

  useEffect(() => {
    if (!sheet) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSheet(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  const personasActive = pathMatches(pathname, "/ganar");
  const homeActive = pathMatches(pathname, "/dashboard");
  const equiposActive =
    pathMatches(pathname, "/celulas") || pathMatches(pathname, "/liderazgo");
  const rutaActive = ESCALERA_STEPS.some(
    (s) =>
      pathMatches(pathname, s.href) ||
      s.children.some((c) => pathMatches(pathname, c.href)),
  );

  return (
    <>
      {sheet ? (
        <div className="fixed inset-0 z-50 min-[1180px]:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(17,17,17,0.35)]"
            aria-label="Cerrar panel"
            onClick={() => setSheet(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className={cn(
              "absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-[var(--radius-lg)] bg-[var(--surface)]",
              "pb-[calc(var(--dock-height)+env(safe-area-inset-bottom)+12px)] pt-3 shadow-[var(--shadow-float)]",
              "motion-safe:animate-[neo-sheet-up_var(--motion-base)_var(--ease-editorial)]",
            )}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
            {sheet === "ruta" ? <RutaSheet onNavigate={() => setSheet(null)} /> : null}
            {sheet === "equipos" ? <EquiposSheet onNavigate={() => setSheet(null)} /> : null}
            {sheet === "mas" ? (
              <MasSheet
                userEmail={userEmail}
                signOutAction={signOutAction}
                onNavigate={() => setSheet(null)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Navegación inferior"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]",
          "min-[1180px]:hidden",
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <ul className="mx-auto grid h-[var(--dock-height)] max-w-[var(--content-max)] grid-cols-5">
          <DockItem href="/dashboard" label="Inicio" active={homeActive} icon={<IconHome className="size-5" />} />
          <DockItem href="/ganar" label="Personas" active={personasActive} icon={<IconPeople className="size-5" />} />
          <li>
            <button
              type="button"
              onClick={() => setSheet(sheet === "ruta" ? null : "ruta")}
              className={cn(
                "neo-touch flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                sheet === "ruta" || (rutaActive && !personasActive && !equiposActive && !homeActive)
                  ? "text-[var(--cobalt)]"
                  : "text-[var(--muted)]",
              )}
              aria-expanded={sheet === "ruta"}
            >
              <IconRoute className="size-5" />
              Ruta
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setSheet(sheet === "equipos" ? null : "equipos")}
              className={cn(
                "neo-touch flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                sheet === "equipos" || equiposActive ? "text-[var(--cobalt)]" : "text-[var(--muted)]",
              )}
              aria-expanded={sheet === "equipos"}
            >
              <IconTeams className="size-5" />
              Equipos
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setSheet(sheet === "mas" ? null : "mas")}
              className={cn(
                "neo-touch flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                sheet === "mas" ? "text-[var(--cobalt)]" : "text-[var(--muted)]",
              )}
              aria-expanded={sheet === "mas"}
            >
              <IconMore className="size-5" />
              Más
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

function DockItem({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "neo-touch flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
          active ? "text-[var(--cobalt)]" : "text-[var(--muted)]",
        )}
      >
        {icon}
        {label}
      </Link>
    </li>
  );
}

function RutaSheet({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <div className="space-y-4 px-4 pb-2">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink)]">
        Ruta pastoral
      </h2>
      {ESCALERA_STEPS.map((step) => (
        <div key={step.id}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {step.number} {step.label}
          </p>
          <ul className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
            {step.children.map((child) => (
              <li key={child.id} className="border-b border-[var(--border)] last:border-b-0">
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-h-[var(--touch-min)] items-center px-3 py-2 text-sm",
                    pathMatches(pathname, child.href)
                      ? "bg-[var(--brand-soft)] font-medium text-[var(--cobalt-dark)]"
                      : "text-[var(--ink)]",
                  )}
                >
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EquiposSheet({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const items = [
    { href: "/celulas", label: "Células" },
    { href: "/liderazgo", label: "Liderazgo" },
    { href: "/enviar", label: "Resumen / Enviar" },
  ];
  return (
    <div className="space-y-3 px-4 pb-2">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink)]">
        Equipos
      </h2>
      <ul className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
        {items.map((item) => (
          <li key={item.href} className="border-b border-[var(--border)] last:border-b-0">
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex min-h-[var(--touch-min)] items-center px-3 py-2 text-sm",
                pathMatches(pathname, item.href)
                  ? "bg-[var(--brand-soft)] font-medium text-[var(--cobalt-dark)]"
                  : "text-[var(--ink)]",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MasSheet({
  onNavigate,
  userEmail,
  signOutAction,
}: {
  onNavigate: () => void;
  userEmail?: string | null;
  signOutAction?: () => Promise<void>;
}) {
  const pathname = usePathname();
  return (
    <div className="space-y-4 px-4 pb-2">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink)]">
        Más
      </h2>
      {SECONDARY_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {group.label}
          </p>
          <ul className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
            {group.items.map((item) => (
              <li key={item.id} className="border-b border-[var(--border)] last:border-b-0">
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-h-[var(--touch-min)] items-center px-3 py-2 text-sm",
                    pathMatches(pathname, item.href)
                      ? "bg-[var(--brand-soft)] font-medium text-[var(--cobalt-dark)]"
                      : "text-[var(--ink)]",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-3">
        {userEmail ? <p className="truncate text-xs text-[var(--muted)]">{userEmail}</p> : null}
        {signOutAction ? (
          <form action={signOutAction} className="mt-2">
            <button type="submit" className="text-sm font-medium text-[var(--ink)] underline">
              Cerrar sesión
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
