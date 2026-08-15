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
