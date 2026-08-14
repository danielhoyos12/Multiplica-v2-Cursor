export const PERMISSION_SEEDS = [
  {
    code: "platform.configure",
    name: "Configurar plataforma",
    description: "Gestionar catálogos base y roles de sistema.",
  },
  {
    code: "ministry.manage",
    name: "Gestionar ministerios",
    description: "Crear/editar/activar Ministerios Generales (Superadmin).",
  },
  {
    code: "ministry.read",
    name: "Leer ministerios",
    description: "Ver Ministerios dentro del scope autorizado.",
  },
  {
    code: "network.read",
    name: "Leer redes",
    description: "Consultar catálogo de Redes.",
  },
  {
    code: "users.read",
    name: "Leer usuarios",
    description: "Listar usuarios de aplicación dentro del scope.",
  },
  {
    code: "users.assign_roles",
    name: "Asignar roles",
    description: "Asignar roles y responsable de Ministerio.",
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
    "ministry.read",
    "network.read",
    "users.read",
    "users.assign_roles",
    "persons.read",
    "persons.write",
    "audit.read",
  ],
  leader_general: [
    "ministry.read",
    "network.read",
    "users.read",
    "persons.read",
    "persons.write",
    "audit.read",
  ],
  leader: ["persons.read", "persons.write", "network.read"],
  staff: ["persons.read", "persons.write", "network.read", "ministry.read"],
};
