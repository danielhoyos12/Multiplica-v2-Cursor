/**
 * Pure progress counters for Plan 3–12 — no editable counters without evidence.
 */

export type DiscipleRow = {
  personId: string;
  slotIndex: number;
  cohort: "first_six" | "second_six";
  formationStatus:
    | "en_formacion"
    | "apto_liderar"
    | "lider_aprobado"
    | "lider_activo_celula";
  cellId?: string | null;
};

export type ContactRow = {
  orderIndex: number;
  status: "contact" | "following" | "won" | "dropped";
  linkedPersonId?: string | null;
};

export function countContacts(contacts: ContactRow[]) {
  const uniqueOrders = new Set(contacts.map((c) => c.orderIndex));
  return {
    listed: uniqueOrders.size,
    target: 15,
    wonLinked: contacts.filter((c) => c.status === "won" && c.linkedPersonId).length,
  };
}

export function countTeam(disciples: DiscipleRow[]) {
  const uniquePersons = new Set(disciples.map((d) => d.personId));
  const firstSix = disciples.filter((d) => d.cohort === "first_six");
  const secondSix = disciples.filter((d) => d.cohort === "second_six");
  const activeLeaders = disciples.filter(
    (d) => d.formationStatus === "lider_activo_celula" && Boolean(d.cellId),
  );
  return {
    teamSize: uniquePersons.size,
    target: 12,
    firstSix: new Set(firstSix.map((d) => d.personId)).size,
    secondSix: new Set(secondSix.map((d) => d.personId)).size,
    activeLeadersWithCell: activeLeaders.length,
    activeLeadersTarget: 6,
  };
}

export function assertNoDuplicateSlots(disciples: DiscipleRow[]): string[] {
  const errors: string[] = [];
  const byPerson = new Map<string, number>();
  const bySlot = new Map<number, string>();
  for (const d of disciples) {
    if (byPerson.has(d.personId)) {
      errors.push(`Persona ${d.personId} duplicada en el equipo.`);
    }
    byPerson.set(d.personId, d.slotIndex);
    if (bySlot.has(d.slotIndex)) {
      errors.push(`Slot ${d.slotIndex} ocupado por más de una persona.`);
    }
    bySlot.set(d.slotIndex, d.personId);
  }
  return errors;
}

export function milestoneKeysForLevel(level: string): string[] {
  switch (level) {
    case "cd1":
      return ["lista_15", "seguimiento_evangelistico", "ganar_3"];
    case "cd2":
      return ["abrir_celula_3", "vincular_celula", "consolidar_discipulos"];
    case "cd3":
      return ["ganar_otros_3", "seis_completos", "seis_hacia_udlv_cd1"];
    case "em1":
      return ["seis_en_cd1", "supervisar_asistencia", "identificar_rezagados"];
    case "em2":
      return ["seis_en_cd2", "seis_en_reencuentro", "plan_ultimos_6"];
    case "em3":
      return [
        "seis_lideres_activos",
        "ganar_ultimos_6",
        "equipo_12",
        "ultimos_6_en_encuentro",
      ];
    default:
      return [];
  }
}
