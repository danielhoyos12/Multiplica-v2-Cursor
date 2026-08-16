export type NavLeaf = {
  id: string;
  label: string;
  href: string;
  /** Nested operational items (visual only; routes unchanged). */
  children?: NavLeaf[];
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

/**
 * Escalera del Éxito — semantic/visual hierarchy.
 * Routes unchanged. No “Resumen” leaf under Enviar (04 → /enviar).
 */
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
      { id: "celulas", label: "Células", href: "/celulas" },
      {
        id: "liderazgo",
        label: "Liderazgo",
        href: "/liderazgo",
        children: [
          {
            id: "transferencias",
            label: "Transferencias",
            href: "/transferencias",
          },
        ],
      },
    ],
  },
];

/**
 * 05 Reportes — management tool, NOT a doctrinal Escalera step.
 */
export const MANAGEMENT_NAV: NavLeaf & { number: string; kind: "tool" } = {
  id: "reportes",
  number: "05",
  label: "Reportes",
  href: "/reportes",
  kind: "tool",
};

/** Admin + Legacy only — Transferencias/Reportes moved out of Operación. */
export const SECONDARY_GROUPS: NavSecondaryGroup[] = [
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

/** Permission flags used to hide Admin links the page would redirect away from. */
export type SecondaryNavAccess = {
  canReadMinistries: boolean;
  canReadNetworks: boolean;
  canReadUsers: boolean;
  canViewSystemHealth: boolean;
};

export function filterSecondaryGroups(
  access: SecondaryNavAccess,
  groups: NavSecondaryGroup[] = SECONDARY_GROUPS,
): NavSecondaryGroup[] {
  return groups
    .map((group) => {
      if (group.id !== "admin") return group;
      const items = group.items.filter((item) => {
        if (item.id === "ministries") return access.canReadMinistries;
        if (item.id === "networks") return access.canReadNetworks;
        if (item.id === "users") return access.canReadUsers;
        if (item.id === "health") return access.canViewSystemHealth;
        return false;
      });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);
}

export function pathMatches(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function leafMatches(pathname: string, leaf: NavLeaf): boolean {
  if (pathMatches(pathname, leaf.href)) return true;
  return (leaf.children ?? []).some((c) => leafMatches(pathname, c));
}

export function isStepActive(pathname: string, step: NavStep): boolean {
  if (pathMatches(pathname, step.href)) return true;
  return step.children.some((c) => leafMatches(pathname, c));
}

export function findActiveStepId(pathname: string): string | null {
  for (const step of ESCALERA_STEPS) {
    if (isStepActive(pathname, step)) return step.id;
  }
  return null;
}

/** Flatten leaves including nested children (for dock sheets). */
export function flattenNavLeaves(
  leaves: NavLeaf[],
  depth = 0,
): Array<NavLeaf & { depth: number }> {
  const out: Array<NavLeaf & { depth: number }> = [];
  for (const leaf of leaves) {
    out.push({ ...leaf, depth });
    if (leaf.children?.length) {
      out.push(...flattenNavLeaves(leaf.children, depth + 1));
    }
  }
  return out;
}
