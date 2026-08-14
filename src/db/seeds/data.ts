export const NETWORK_SEEDS = [
  {
    code: "hombres" as const,
    name: "Hombres",
    isActive: true,
    isConfigurable: false,
    sortOrder: 1,
  },
  {
    code: "mujeres" as const,
    name: "Mujeres",
    isActive: true,
    isConfigurable: false,
    sortOrder: 2,
  },
  {
    code: "jovenes" as const,
    name: "Jóvenes",
    isActive: true,
    isConfigurable: false,
    sortOrder: 3,
  },
  {
    code: "ninos" as const,
    name: "Niños",
    isActive: false,
    isConfigurable: true,
    sortOrder: 4,
  },
] as const;

/**
 * Catálogo inicial de distritos de Lima Metropolitana (Lima + Callao).
 * Fuente de catálogo operativo para Ganar; no inventa Ministerios Generales.
 */
export const LIMA_METROPOLITANA_DISTRICTS = [
  "Ancón",
  "Ate",
  "Barranco",
  "Breña",
  "Carabayllo",
  "Chaclacayo",
  "Chorrillos",
  "Cieneguilla",
  "Comas",
  "El Agustino",
  "Independencia",
  "Jesús María",
  "La Molina",
  "La Victoria",
  "Lima",
  "Lince",
  "Los Olivos",
  "Lurigancho",
  "Lurín",
  "Magdalena del Mar",
  "Miraflores",
  "Pachacámac",
  "Pucusana",
  "Pueblo Libre",
  "Puente Piedra",
  "Punta Hermosa",
  "Punta Negra",
  "Rímac",
  "San Bartolo",
  "San Borja",
  "San Isidro",
  "San Juan de Lurigancho",
  "San Juan de Miraflores",
  "San Luis",
  "San Martín de Porres",
  "San Miguel",
  "Santa Anita",
  "Santa María del Mar",
  "Santa Rosa",
  "Santiago de Surco",
  "Surquillo",
  "Villa El Salvador",
  "Villa María del Triunfo",
  // Callao
  "Bellavista",
  "Callao",
  "Carmen de la Legua Reynoso",
  "La Perla",
  "La Punta",
  "Mi Perú",
  "Ventanilla",
] as const;

export const ROLE_SEEDS = [
  {
    code: "superadmin",
    name: "Superadmin",
    description: "Acceso global de plataforma. Configura Ministerios y políticas.",
    scopeType: "global" as const,
  },
  {
    code: "leader_general",
    name: "Líder General",
    description: "Alcance amplio de Ministerio/estructura según asignación.",
    scopeType: "ministry" as const,
  },
  {
    code: "leader",
    name: "Líder",
    description: "Visibilidad descendente de su nodo y estructura autorizada.",
    scopeType: "tree" as const,
  },
  {
    code: "staff",
    name: "Staff",
    description: "Operaciones administrativas acotadas por Ministerio/Red.",
    scopeType: "ministry" as const,
  },
] as const;

export const PERMISSION_SEEDS = [
  {
    code: "platform.configure",
    name: "Configurar plataforma",
    description: "Gestionar catálogos base y roles de sistema.",
  },
  {
    code: "ministry.manage",
    name: "Gestionar ministerios",
    description: "Crear/editar Ministerios Generales.",
  },
  {
    code: "persons.read",
    name: "Leer personas",
    description: "Ver personas dentro del scope autorizado.",
  },
  {
    code: "persons.write",
    name: "Escribir personas",
    description: "Crear/actualizar personas dentro del scope autorizado.",
  },
  {
    code: "audit.read",
    name: "Leer auditoría",
    description: "Consultar audit logs autorizados.",
  },
] as const;

export const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  superadmin: [
    "platform.configure",
    "ministry.manage",
    "persons.read",
    "persons.write",
    "audit.read",
  ],
  leader_general: ["persons.read", "persons.write", "audit.read"],
  leader: ["persons.read", "persons.write"],
  staff: ["persons.read", "persons.write"],
};
