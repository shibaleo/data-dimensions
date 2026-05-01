import { z } from "zod";

export const serviceCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  source_kind: z.string().min(1),
});

export const serviceUpdateInputSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  source_kind: z.string().min(1).optional(),
  sort_order: z.number().int().nonnegative().optional(),
});
