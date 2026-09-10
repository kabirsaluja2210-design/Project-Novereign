import { z } from "zod";

export const createCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  age: z.string().max(50).optional(),
  appearance: z.string().max(500).optional(),
  clothing: z.string().max(500).optional(),
  style: z.string().max(100).optional(),
});
