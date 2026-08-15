import { z } from "zod";

export const startConsolidationInputSchema = z.object({
  personId: z.string().uuid(),
  ministryId: z.string().uuid(),
  assignedLeaderPersonId: z.string().uuid().nullable().optional(),
});

export const completeConsolidationInputSchema = z.object({
  personId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

export const pauseProcessInputSchema = z.object({
  personId: z.string().uuid(),
  processType: z.enum(["consolidar", "udv"]),
  note: z.string().trim().max(500).optional(),
});

export const resumeProcessInputSchema = z.object({
  personId: z.string().uuid(),
  processType: z.enum(["consolidar", "udv"]),
});

export const createCycleInputSchema = z.object({
  name: z.string().trim().min(3).max(160),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ministryId: z.string().uuid().optional().nullable().or(z.literal("")),
});

export type CreateCycleInput = z.infer<typeof createCycleInputSchema>;

export const enrollUdvInputSchema = z.object({
  personId: z.string().uuid(),
  cycleId: z.string().uuid(),
});

export const recordAttendanceInputSchema = z.object({
  enrollmentId: z.string().uuid(),
  moduleId: z.string().uuid(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["present", "absent", "excused", "recovered"]),
  notes: z.string().trim().max(400).optional().or(z.literal("")),
});

export type RecordAttendanceInput = z.infer<typeof recordAttendanceInputSchema>;

export const authorizeRecoveryInputSchema = z.object({
  attendanceId: z.string().uuid(),
  note: z.string().trim().max(400).optional(),
});

export const completeUdvInputSchema = z.object({
  personId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

export const createDestinoCycleInputSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  name: z.string().trim().min(3).max(160),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ministryId: z.string().uuid().optional().nullable().or(z.literal("")),
});

export const enrollDestinoInputSchema = z.object({
  personId: z.string().uuid(),
  cycleId: z.string().uuid(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const markAcademicCompletedInputSchema = z.object({
  personId: z.string().uuid(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  enrollmentId: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
});

export const completeDestinoLevelInputSchema = z.object({
  personId: z.string().uuid(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  note: z.string().trim().max(500).optional(),
  overrideRequirementIds: z.array(z.string().uuid()).optional(),
  overrideReason: z.string().trim().min(5).max(500).optional(),
});

export const assignCycleStaffInputSchema = z.object({
  cycleId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["teacher", "coordinator", "assistant"]).optional(),
  canCompleteLevel: z.boolean().optional(),
});

export const createEmCycleInputSchema = z.object({
  name: z.string().trim().min(3).max(160),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ministryId: z.string().uuid().optional().nullable().or(z.literal("")),
});

export const enrollEmInputSchema = z.object({
  personId: z.string().uuid(),
  cycleId: z.string().uuid(),
});

export const markEmAcademicInputSchema = z.object({
  personId: z.string().uuid(),
  enrollmentId: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
});

export const completeEmInputSchema = z.object({
  personId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
  overrideRequirementIds: z.array(z.string().uuid()).optional(),
  overrideReason: z.string().trim().min(5).max(500).optional(),
});

export const createReencuentroEventInputSchema = z.object({
  name: z.string().trim().min(3).max(160),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ministryId: z.string().uuid().optional().nullable().or(z.literal("")),
});

export const enrollReencuentroInputSchema = z.object({
  personId: z.string().uuid(),
  cycleId: z.string().uuid(),
});

export const recordReencuentroAttendanceInputSchema = z.object({
  enrollmentId: z.string().uuid(),
  status: z.enum(["present", "absent", "excused", "recovered"]),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(400).optional().or(z.literal("")),
});

export const completeReencuentroInputSchema = z.object({
  personId: z.string().uuid(),
  enrollmentId: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
});
