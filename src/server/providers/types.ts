/**
 * Normalized provider contract (directive §8/§224). No provider-specific
 * response shape is ever allowed to leak past an adapter - business logic
 * only ever sees `ProviderResult<T>`.
 */
export interface ProviderResult<T> {
  success: boolean;
  provider: string;
  kind: "mock" | "real";
  model?: string;
  providerJobId?: string;
  costUnits: number;
  durationMs: number;
  data?: T;
  error?: { code: string; message: string; retryable: boolean };
}

export interface ScriptRequest {
  idea: string;
  durationSec: number;
  sceneCount: number;
  language: string;
  styleKey?: string;
}

export interface ScriptScene {
  index: number;
  durationSec: number;
  narration: string;
  visualPrompt: string;
  motionPrompt: string;
}

export interface ScriptOutput {
  title: string;
  hook: string;
  scenes: ScriptScene[];
}

export interface TextGenerationProvider {
  name: string;
  kind: "mock" | "real";
  isAvailable(): boolean;
  generateScript(input: ScriptRequest): Promise<ProviderResult<ScriptOutput>>;
}

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: string;
}

export interface ImageOutput {
  storageKey: string;
  width: number;
  height: number;
}

export interface ImageGenerationProvider {
  name: string;
  kind: "mock" | "real";
  isAvailable(): boolean;
  generateImage(input: ImageRequest): Promise<ProviderResult<ImageOutput>>;
}

export interface VoiceRequest {
  text: string;
  voiceProviderVoiceId?: string;
  language: string;
}

export interface VoiceOutput {
  storageKey: string;
  durationSec: number;
  timingData: Array<{ word: string; startSec: number; endSec: number }>;
}

export interface VoiceGenerationProvider {
  name: string;
  kind: "mock" | "real";
  isAvailable(): boolean;
  generateVoice(input: VoiceRequest): Promise<ProviderResult<VoiceOutput>>;
}
