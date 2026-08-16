export type NavLeaf = {
  id: string;
  label: string;
  href: string;
};

export type NavStep = {
  id: string;
  number: string;
  label: string;
  /** Primary href when selecting the step itself */
  href: string;
  children: NavLeaf[];
  icon: "ganar" | "consolidar" | "discipular" | "enviar";
};

export type NavSecondaryGroup = {
  id: string;
  label: string;
  items: NavLeaf[];
};

/** Escalera del Éxito — visual/semantic only; routes unchanged. */
export const ESCALERA_STEPS: NavStep[] = [
  {
    id: "ganar",
    number: "01",
    label: "Ganar",
    href: "/ganar",
    icon: "ganar",
    children: [{ id: "personas", label: "Personas", href: "/ganar" }],
  },
  {
    id: "consolidar",
    number: "02",
    label: "Consolidar",
    href: "/proceso",
    icon: "consolidar",
    children: [
      { id: "pre", label: "Pre-Encuentro", href: "/proceso" },
      { id: "encuentro", label: "Encuentro", href: "/proceso" },
      { id: "post", label: "Post-Encuentro", href: "/proceso" },
    ],
  },
  {
    id: "discipular",
    number: "03",
    label: "Discipular",
    href: "/destino",
    icon: "discipular",
    children: [
      { id: "destino", label: "Capacitación Destino", href: "/destino" },
      { id: "reencuentro", label: "Re-Encuentro", href: "/reencuentro" },
      {
        id: "escuela",
        label: "Escuela Ministerial",
        href: "/escuela-ministerial",
      },
    ],
  },
  {
    id: "enviar",
    number: "04",
    label: "Enviar",
    href: "/enviar",
    icon: "enviar",
    children: [
      { id: "enviar-resumen", label: "Resumen / Enviar", href: "/enviar" },
      { id: "celulas", label: "Células", href: "/celulas" },
      { id: "liderazgo", label: "Liderazgo", href: "/liderazgo" },
    ],
  },
];

export const SECONDARY_GROUPS: NavSecondaryGroup[] = [
  {
    id: "operacion",
    label: "Operación",
    items: [
      { id: "transferencias", label: "Transferencias", href: "/transferencias" },
      { id: "reportes", label: "Reportes", href: "/reportes" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      { id: "ministries", label: "Ministerios", href: "/admin/ministries" },
      { id: "networks", label: "Redes", href: "/admin/networks" },
      { id: "users", label: "Usuarios", href: "/admin/users" },
      { id: "health", label: "System Health", href: "/admin/system-health" },
    ],
  },
  {
    id: "legacy",
    label: "Legacy",
    items: [{ id: "udv", label: "UDV", href: "/udv" }],
  },
];

export function pathMatches(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isStepActive(pathname: string, step: NavStep): boolean {
  if (pathMatches(pathname, step.href)) return true;
  return step.children.some((c) => pathMatches(pathname, c.href));
}

export function findActiveStepId(pathname: string): string | null {
  for (const step of ESCALERA_STEPS) {
    if (isStepActive(pathname, step)) return step.id;
  }
  return null;
}
