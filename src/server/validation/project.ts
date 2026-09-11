import { z } from "zod";

export const aspectRatioSchema = z.enum(["RATIO_9_16", "RATIO_16_9", "RATIO_1_1", "RATIO_4_5"]);

export const createProjectSchema = z.object({
  idea: z.string().min(10, "Describe your idea in at least 10 characters").max(2000),
  aspectRatio: aspectRatioSchema.default("RATIO_9_16"),
  durationSec: z.number().int().min(15).max(1800),
  styleKey: z.string().optional(),
  voiceId: z.string().optional(),
  language: z.string().default("en"),
  captionsEnabled: z.boolean().default(true),
  musicEnabled: z.boolean().default(false),
  sfxEnabled: z.boolean().default(false),
  clientRequestId: z.string().min(1).max(200).optional(),
});
