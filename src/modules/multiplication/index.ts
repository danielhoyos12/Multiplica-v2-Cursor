export {
  assignTeamDisciple,
  buildProjectionsForStudent,
  getExpedienteProgress,
  linkWonContact,
  listOpenExpedientesSummary,
  openOrGetExpediente,
  seedDefaultMilestones,
  setDiscipleFormationStatus,
  upsertContactSlot,
} from "./service";

export {
  assertNoDuplicateSlots,
  countContacts,
  countTeam,
  milestoneKeysForLevel,
} from "./progress";

export { projectA, projectB, projectC, projectAll } from "./projections";
export type { ProjectionResult, ProjectionStatus } from "./projections";
