import { z } from "zod";

export const dayOfWeekSchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export const cellTypeSchema = z.enum(["evangelistic", "twelve"]);
export const cellStatusSchema = z.enum(["active", "inactive", "closed"]);
export const attendanceStatusSchema = z.enum(["present", "absent", "excused"]);

/** HH:MM or HH:MM:SS */
export const startTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "Hora inválida (usa HH:MM).")
  .transform((value) => (value.length === 5 ? `${value}:00` : value));

export const createCellInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(40).optional().or(z.literal("")),
  type: cellTypeSchema,
  ministryId: z.string().uuid(),
  networkId: z.string().uuid(),
  responsiblePersonId: z.string().uuid().optional().nullable(),
  dayOfWeek: dayOfWeekSchema,
  startTime: startTimeSchema,
  timezone: z.string().trim().min(3).max(64).default("America/Lima"),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  districtId: z.string().uuid().optional().nullable().or(z.literal("")),
});

export type CreateCellInput = z.infer<typeof createCellInputSchema>;

export const updateCellInputSchema = createCellInputSchema
  .omit({ ministryId: true, type: true })
  .partial()
  .extend({
    status: cellStatusSchema.optional(),
  });

export type UpdateCellInput = z.infer<typeof updateCellInputSchema>;

export const addMemberInputSchema = z.object({
  personId: z.string().uuid(),
});

export const removeMemberInputSchema = z.object({
  membershipId: z.string().uuid(),
  reason: z.string().trim().max(240).optional().or(z.literal("")),
});

export const reassignMemberInputSchema = z.object({
  membershipId: z.string().uuid(),
  targetCellId: z.string().uuid(),
  reason: z.string().trim().max(240).optional().or(z.literal("")),
});

export const attendanceRecordSchema = z.object({
  personId: z.string().uuid(),
  membershipId: z.string().uuid().optional().nullable(),
  status: attendanceStatusSchema,
  notes: z.string().trim().max(200).optional().or(z.literal("")),
});

export const saveAttendanceInputSchema = z.object({
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)."),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  records: z.array(attendanceRecordSchema).min(1).max(500),
});

export type SaveAttendanceInput = z.infer<typeof saveAttendanceInputSchema>;
