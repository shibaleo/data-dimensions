import { z } from "zod";

export const targetMasterCreateInputSchema = z.object({
  service_id: z.string().uuid(),
  name: z.string().min(1),
  parent_id: z.string().uuid().nullish(),
  valid_from: z.string().datetime().optional(),
});

export const targetMasterUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  parent_id: z.string().uuid().nullish(),
  valid_from: z.string().datetime().optional(),
});
