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

export const startTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/)
  .transform((value) => (value.length === 5 ? `${value}:00` : value));

export const markEligibleInputSchema = z.object({
  personId: z.string().min(1),
  ministryId: z.string().min(1),
  networkId: z.string().min(1),
  /** Intended direct leader (pastoral sponsor); required at activation unless root. */
  directLeaderPersonId: z.string().min(1).nullable().optional(),
});

export const activateLeaderInputSchema = z.object({
  personId: z.string().min(1),
  directLeaderPersonId: z.string().min(1).nullable().optional(),
  isMinistryRoot: z.boolean().optional().default(false),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  cell: z.object({
    name: z.string().trim().min(2).max(120),
    dayOfWeek: dayOfWeekSchema,
    startTime: startTimeSchema,
    address: z.string().trim().max(240).optional().or(z.literal("")),
    districtId: z.string().min(1).optional().nullable().or(z.literal("")),
  }),
});

export type ActivateLeaderInput = z.infer<typeof activateLeaderInputSchema>;

export const convertTwelveInputSchema = z.object({
  cellId: z.string().min(1),
  /** Ordinary members to move into the leader's remaining evangelistic cell (created if needed). */
  ordinaryMemberPersonIds: z.array(z.string().min(1)).default([]),
  evangelisticCellName: z.string().trim().min(2).max(120).optional(),
});

export type ConvertTwelveInput = z.infer<typeof convertTwelveInputSchema>;
