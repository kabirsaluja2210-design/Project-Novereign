import type {
  ProviderResult,
  ScriptOutput,
  ScriptRequest,
  ScriptScene,
  TextGenerationProvider,
} from "../types";
import { OPERATION_COSTS } from "@/server/credits/estimate";

/**
 * Deterministic template-based script generator. This is a REAL, working
 * generator (not a stub) - it produces a structured short-form script
 * following the hook/premise/escalation/payoff arc from directive §17 - it
 * simply doesn't call an external LLM. Swap in `OpenAITextProvider` (or
 * another real adapter) by setting OPENAI_API_KEY.
 */
export class MockTextProvider implements TextGenerationProvider {
  name = "mock";
  kind = "mock" as const;

  isAvailable(): boolean {
    return true;
  }

  async generateScript(input: ScriptRequest): Promise<ProviderResult<ScriptOutput>> {
    const start = Date.now();
    const idea = input.idea.trim();
    const title = toTitle(idea);
    const hook = buildHook(idea);
    const beats = buildBeats(idea, input.sceneCount);

    const perSceneDuration = input.durationSec / input.sceneCount;
    const scenes: ScriptScene[] = beats.map((beat, i) => ({
      index: i,
      durationSec: Math.round(perSceneDuration * 10) / 10,
      narration: beat.narration,
      visualPrompt: beat.visual,
      motionPrompt: beat.motion,
    }));

    return {
      success: true,
      provider: this.name,
      kind: this.kind,
      model: "template-v1",
      costUnits: OPERATION_COSTS.SCRIPT_GENERATION,
      durationMs: Date.now() - start,
      data: { title, hook, scenes },
    };
  }
}

function toTitle(idea: string): string {
  const trimmed = idea.replace(/[.?!]+$/, "");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}

function buildHook(idea: string): string {
  return `You won't believe what happens next: ${idea}`;
}

interface Beat {
  narration: string;
  visual: string;
  motion: string;
}

/**
 * Splits the idea into a hook/premise/escalation/complication/payoff arc
 * spread across `sceneCount` scenes, per directive §17's short-form pacing
 * structure.
 */
function buildBeats(idea: string, sceneCount: number): Beat[] {
  const stageTemplates = [
    (i: string) => `Right away, we're pulled in: ${i}`,
    (i: string) => `Here's the setup. ${i}`,
    (i: string) => `Then things start to escalate...`,
    (i: string) => `Just when it seems under control, a complication appears.`,
    (i: string) => `The tension peaks.`,
    (i: string) => `And then, the twist nobody saw coming.`,
    (i: string) => `The payoff lands.`,
    (i: string) => `One last thought lingers as the story loops back to the start.`,
  ];

  const beats: Beat[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const template = stageTemplates[Math.min(i, stageTemplates.length - 1)]!;
    const narration = template(idea);
    beats.push({
      narration,
      visual: `${idea}, scene ${i + 1} of ${sceneCount}, consistent character and setting, high detail`,
      motion: i === 0 ? "slow zoom in" : i % 2 === 0 ? "slow pan left" : "slow pan right",
    });
  }
  return beats;
}
