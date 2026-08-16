"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { BrandMark } from "@/components/layout/brand-mark";
import {
  ESCALERA_STEPS,
  SECONDARY_GROUPS,
  findActiveStepId,
  isStepActive,
  pathMatches,
  type NavStep,
} from "@/components/layout/nav-config";
import {
  IconChevron,
  IconConsolidar,
  IconDiscipular,
  IconEnviar,
  IconGanar,
  IconHome,
} from "@/components/layout/nav-icons";
import { cn } from "@/lib/cn";

type Props = {
  userEmail?: string | null;
  signOutAction?: () => Promise<void>;
};

export function AppSidebar({ userEmail, signOutAction }: Props) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const activeStep = findActiveStepId(pathname);
  const [openStep, setOpenStep] = useState<string | null>(activeStep);
  const [openForPath, setOpenForPath] = useState(pathname);
  const panelId = useId();

  if (openForPath !== pathname) {
    setOpenForPath(pathname);
    setOpenStep(activeStep);
  }

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      <aside
        className={cn(
          "fixed z-40 hidden flex-col text-[#F3F0E8] min-[1180px]:flex",
          "top-[var(--sidebar-inset)] bottom-[var(--sidebar-inset)] left-[var(--sidebar-inset)]",
          "w-[var(--sidebar-collapsed)] rounded-[var(--radius-lg)] bg-[var(--ink)]",
          "shadow-[var(--shadow-float)]",
        )}
        aria-label="Navegación Escalera del Éxito"
      >
        <div className="flex flex-col items-center gap-3 px-2 pt-4">
          <BrandMark compact inverse />
          <button
            type="button"
            className="neo-touch flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[#F3F0E8]/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded(true)}
            title="Expandir menú"
          >
            <IconChevron className="size-5" />
            <span className="sr-only">Expandir menú</span>
          </button>
        </div>

        <nav className="mt-4 flex flex-1 flex-col items-center gap-1.5 px-2">
          {ESCALERA_STEPS.map((step) => (
            <RailIcon
              key={step.id}
              step={step}
              active={isStepActive(pathname, step)}
              onOpen={() => {
                setOpenStep(step.id);
                setExpanded(true);
              }}
            />
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 px-2 py-3">
          <Link
            href="/dashboard"
            title="Inicio"
            className={cn(
              "neo-touch mx-auto flex size-10 items-center justify-center rounded-[var(--radius-md)] transition-colors",
              pathMatches(pathname, "/dashboard")
                ? "bg-[var(--cobalt)] text-white"
                : "text-[#F3F0E8]/80 hover:bg-white/10 hover:text-white",
            )}
          >
            <IconHome className="size-5" />
            <span className="sr-only">Inicio</span>
          </Link>
        </div>
      </aside>

      {expanded ? (
        <div className="fixed inset-0 z-50 hidden min-[1180px]:block">
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(17,17,17,0.28)]"
            aria-label="Cerrar menú"
            onClick={() => setExpanded(false)}
          />
          <aside
            id={panelId}
            className={cn(
              "absolute flex flex-col overflow-hidden text-[#F3F0E8]",
              "top-[var(--sidebar-inset)] bottom-[var(--sidebar-inset)] left-[var(--sidebar-inset)]",
              "w-[var(--sidebar-expanded)] rounded-[var(--radius-lg)] bg-[var(--ink)]",
              "shadow-[var(--shadow-float)]",
              "motion-safe:animate-[neo-slide_var(--motion-base)_var(--ease-editorial)]",
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
              <BrandMark inverse />
              <button
                type="button"
                className="neo-touch flex size-10 items-center justify-center rounded-[var(--radius-md)] hover:bg-white/10"
                onClick={() => setExpanded(false)}
              >
                <span className="sr-only">Colapsar</span>
                <IconChevron className="size-5 rotate-180" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F3F0E8]/45">
                Escalera del Éxito
              </p>
              <div className="space-y-1">
                {ESCALERA_STEPS.map((step) => {
                  const open = openStep === step.id;
                  const active = isStepActive(pathname, step);
                  return (
                    <div key={step.id} className="rounded-[var(--radius-md)]">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors",
                          active
                            ? "bg-[var(--cobalt)] text-white"
                            : "text-[#F3F0E8]/90 hover:bg-white/10",
                        )}
                        aria-expanded={open}
                        onClick={() => setOpenStep(open ? null : step.id)}
                      >
                        <StepGlyph name={step.icon} className="size-5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-semibold tracking-[0.14em] opacity-70">
                            {step.number}
                          </span>
                          <span className="font-[family-name:var(--font-display)] text-sm font-semibold">
                            {step.label}
                          </span>
                        </span>
                        <IconChevron
                          className={cn(
                            "size-4 shrink-0 opacity-70 transition-transform",
                            open && "rotate-90",
                          )}
                        />
                      </button>
                      {open ? (
                        <ul className="mb-2 ml-4 space-y-0.5 border-l border-white/15 py-1 pl-3">
                          {step.children.map((child) => {
                            const childActive = pathMatches(pathname, child.href);
                            return (
                              <li key={child.id}>
                                <Link
                                  href={child.href}
                                  onClick={() => setExpanded(false)}
                                  className={cn(
                                    "block rounded-[var(--radius-sm)] px-2.5 py-2 text-sm transition-colors",
                                    childActive
                                      ? "bg-white/12 font-medium text-white"
                                      : "text-[#F3F0E8]/75 hover:bg-white/10 hover:text-white",
                                  )}
                                >
                                  {child.label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
                {SECONDARY_GROUPS.map((group) => (
                  <div key={group.id}>
                    <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F3F0E8]/40">
                      {group.label}
                    </p>
                    <ul className="space-y-0.5">
                      {group.items.map((item) => {
                        const active = pathMatches(pathname, item.href);
                        return (
                          <li key={item.id}>
                            <Link
                              href={item.href}
                              onClick={() => setExpanded(false)}
                              className={cn(
                                "block rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors",
                                active
                                  ? "bg-[var(--cobalt)] font-medium text-white"
                                  : "text-[#F3F0E8]/70 hover:bg-white/10 hover:text-white",
                              )}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              {userEmail ? (
                <p className="truncate text-xs text-[#F3F0E8]/55" title={userEmail}>
                  {userEmail}
                </p>
              ) : null}
              {signOutAction ? (
                <form action={signOutAction} className="mt-2">
                  <button
                    type="submit"
                    className="neo-touch text-left text-sm font-medium text-[#F3F0E8] underline-offset-2 hover:underline"
                  >
                    Cerrar sesión
                  </button>
                </form>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function StepGlyph({
  name,
  className,
}: {
  name: NavStep["icon"];
  className?: string;
}) {
  switch (name) {
    case "ganar":
      return <IconGanar className={className} />;
    case "consolidar":
      return <IconConsolidar className={className} />;
    case "discipular":
      return <IconDiscipular className={className} />;
    case "enviar":
      return <IconEnviar className={className} />;
  }
}

function RailIcon({
  step,
  active,
  onOpen,
}: {
  step: NavStep;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      title={`${step.number} ${step.label}`}
      aria-label={`${step.number} ${step.label}`}
      onClick={onOpen}
      className={cn(
        "neo-touch group relative flex size-10 items-center justify-center rounded-[var(--radius-md)] transition-colors",
        active
          ? "bg-[var(--cobalt)] text-white"
          : "text-[#F3F0E8]/75 hover:bg-white/10 hover:text-white",
      )}
    >
      <StepGlyph name={step.icon} className="size-5" />
      {active ? (
        <span
          className="absolute -right-0.5 top-1 size-1.5 rounded-full bg-[var(--vermilion)]"
          aria-hidden
        />
      ) : null}
      <span className="pointer-events-none absolute left-[calc(100%+10px)] z-50 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--ink)] px-2 py-1 text-xs text-white opacity-0 shadow-[var(--shadow-card)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {step.number} {step.label}
      </span>
    </button>
  );
}
