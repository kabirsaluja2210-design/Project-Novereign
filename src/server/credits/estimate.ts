/**
 * Credit cost estimation (directive §79/§144). Base per-operation costs are
 * defined here as constants rather than scattered through the UI - moving
 * these into a DB-driven `OperationCost` table is a straightforward follow-up
 * (see PRODUCT_SPEC.md roadmap) once pricing needs to be admin-editable.
 */

export const OPERATION_COSTS = {
  SCRIPT_GENERATION: 5,
  IMAGE_PER_SCENE: 10,
  VOICE_PER_SECOND: 1,
  CAPTIONS_PER_SCENE: 1,
  MUSIC_TRACK: 10,
  SFX_PER_SCENE: 2,
  RENDER_BASE: 5,
} as const;

const AVG_SCENE_LENGTH_SEC = 7;

export interface CreditEstimateInput {
  durationSec: number;
  captionsEnabled: boolean;
  musicEnabled: boolean;
  sfxEnabled: boolean;
}

export interface CreditEstimate {
  sceneCount: number;
  estimate: number;
  low: number;
  high: number;
  breakdown: Array<{ label: string; credits: number }>;
}

export function estimateCredits(input: CreditEstimateInput): CreditEstimate {
  const sceneCount = Math.max(1, Math.ceil(input.durationSec / AVG_SCENE_LENGTH_SEC));
  const breakdown: Array<{ label: string; credits: number }> = [];

  breakdown.push({ label: "Script & scene planning", credits: OPERATION_COSTS.SCRIPT_GENERATION });
  breakdown.push({
    label: `${sceneCount} scene image${sceneCount > 1 ? "s" : ""}`,
    credits: sceneCount * OPERATION_COSTS.IMAGE_PER_SCENE,
  });
  breakdown.push({
    label: `Narration (${input.durationSec}s)`,
    credits: Math.ceil(input.durationSec * OPERATION_COSTS.VOICE_PER_SECOND),
  });
  if (input.captionsEnabled) {
    breakdown.push({
      label: "Captions",
      credits: sceneCount * OPERATION_COSTS.CAPTIONS_PER_SCENE,
    });
  }
  if (input.musicEnabled) {
    breakdown.push({ label: "Background music", credits: OPERATION_COSTS.MUSIC_TRACK });
  }
  if (input.sfxEnabled) {
    breakdown.push({
      label: "Sound effects",
      credits: sceneCount * OPERATION_COSTS.SFX_PER_SCENE,
    });
  }
  breakdown.push({ label: "Rendering", credits: OPERATION_COSTS.RENDER_BASE });

  const estimate = breakdown.reduce((sum, b) => sum + b.credits, 0);

  return {
    sceneCount,
    estimate,
    low: Math.round(estimate * 0.9),
    high: Math.round(estimate * 1.15),
    breakdown,
  };
}
