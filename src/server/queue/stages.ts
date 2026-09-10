/**
 * Pipeline stage list (directive §7/§199 DAG, implemented subset - see
 * ARCHITECTURE.md). Scene planning is folded into `script_generation`
 * because our script generators return the full scene breakdown in one call;
 * everything else matches the documented DAG.
 */
export const PIPELINE_STAGES = [
  "script_generation",
  "image_generation",
  "voice_generation",
  "caption_generation",
  "render",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  script_generation: "Writing script & planning scenes",
  image_generation: "Generating scene visuals",
  voice_generation: "Generating voiceover",
  caption_generation: "Creating captions",
  render: "Rendering final video",
};
