import type { AspectRatio } from "@prisma/client";

export const ASPECT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  RATIO_9_16: { width: 1080, height: 1920 },
  RATIO_16_9: { width: 1920, height: 1080 },
  RATIO_1_1: { width: 1080, height: 1080 },
  RATIO_4_5: { width: 1080, height: 1350 },
};
