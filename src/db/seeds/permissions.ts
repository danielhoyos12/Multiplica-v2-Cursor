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
    code: "cells.read",
    name: "Leer células",
    description: "Ver células dentro del scope autorizado.",
  },
  {
    code: "cells.create",
    name: "Crear células",
    description: "Abrir nuevas células dentro del Ministerio autorizado.",
  },
  {
    code: "cells.update",
    name: "Actualizar células",
    description: "Editar horarios, estado y datos de células.",
  },
  {
    code: "cells.manage_members",
    name: "Gestionar miembros de célula",
    description: "Agregar, retirar y reasignar membresías.",
  },
  {
    code: "cells.attendance",
    name: "Registrar asistencia de célula",
    description: "Crear sesiones y marcar asistencia semanal.",
  },
  {
    code: "leaders.read",
    name: "Leer liderazgo",
    description: "Ver estados de liderazgo y progreso G12 en el alcance.",
  },
  {
    code: "leaders.mark_eligible",
    name: "Marcar apto para liderar",
    description: "Registrar elegibilidad/unción pastoral.",
  },
  {
    code: "leaders.activate",
    name: "Activar líderes",
    description: "Activar líderes y abrir su célula.",
  },
  {
    code: "leaders.deactivate",
    name: "Desactivar líderes",
    description: "Desactivar líderes con control de estructura.",
  },
  {
    code: "leaders.manage_tree",
    name: "Gestionar árbol",
    description: "Administrar relaciones generacionales.",
  },
  {
    code: "leaders.view_descendants",
    name: "Ver descendientes",
    description: "Navegar el subárbol pastoral autorizado.",
  },
  {
    code: "g12.convert_twelve",
    name: "Convertir a Célula de 12",
    description: "Convertir célula evangelística con 12 líderes activos.",
  },
  {
    code: "audit.read",
    name: "Leer auditoría",
    description: "Consultar audit logs autorizados.",
  },
] as const;

const CELL_PERMS = [
  "cells.read",
  "cells.create",
  "cells.update",
  "cells.manage_members",
  "cells.attendance",
] as const;

const LEADER_PERMS = [
  "leaders.read",
  "leaders.mark_eligible",
  "leaders.activate",
  "leaders.deactivate",
  "leaders.manage_tree",
  "leaders.view_descendants",
  "g12.convert_twelve",
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
    ...CELL_PERMS,
    ...LEADER_PERMS,
    "audit.read",
  ],
  leader_general: [
    "ministry.read",
    "network.read",
    "users.read",
    "persons.read",
    "persons.write",
    ...CELL_PERMS,
    ...LEADER_PERMS,
    "audit.read",
  ],
  leader: [
    "persons.read",
    "persons.write",
    "network.read",
    "cells.read",
    "cells.update",
    "cells.manage_members",
    "cells.attendance",
    "leaders.read",
    "leaders.mark_eligible",
    "leaders.activate",
    "leaders.view_descendants",
    "g12.convert_twelve",
  ],
  staff: [
    "persons.read",
    "persons.write",
    "network.read",
    "ministry.read",
    "cells.read",
    "cells.attendance",
    "leaders.read",
  ],
};
