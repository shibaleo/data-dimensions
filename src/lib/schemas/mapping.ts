import { z } from "zod";

export const mappingChangeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add"),
    source_type: z.string().min(1),
    source_value: z.string().min(1),
    target_id: z.string().uuid(),
  }),
  z.object({
    type: z.literal("remove"),
    mapping_id: z.string().uuid(),
  }),
  z.object({
    type: z.literal("repoint"),
    mapping_id: z.string().uuid(),
    target_id: z.string().uuid(),
  }),
]);

export const mappingsCommitInputSchema = z.object({
  service_id: z.string().uuid(),
  valid_from: z.string().datetime().optional(),
  changes: z.array(mappingChangeSchema).min(1),
});

export type MappingChange = z.infer<typeof mappingChangeSchema>;
