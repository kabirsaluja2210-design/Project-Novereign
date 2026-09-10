import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import type {
  ImageGenerationProvider,
  ProviderResult,
  TextGenerationProvider,
  VoiceGenerationProvider,
} from "./types";
import { MockTextProvider } from "./text/mock";
import { OpenAITextProvider } from "./text/openai";
import { MockImageProvider } from "./image/mock";
import { MockVoiceProvider } from "./voice/mock";

/**
 * Model Router (directive §9/§225). Providers for each capability are tried
 * in priority order; a disabled provider (via ProviderConfig, admin-editable)
 * or one reporting unhealthy (rolling error rate in Redis) is skipped. Every
 * attempt - success or failure - is logged to ProviderUsage for cost/margin
 * reporting (directive §223).
 */

const TEXT_PROVIDERS: TextGenerationProvider[] = [new OpenAITextProvider(), new MockTextProvider()];
const IMAGE_PROVIDERS: ImageGenerationProvider[] = [new MockImageProvider()];
const VOICE_PROVIDERS: VoiceGenerationProvider[] = [new MockVoiceProvider()];

const HEALTH_WINDOW_SEC = 300;
const HEALTH_FAILURE_THRESHOLD = 5;

async function isHealthy(provider: string, capability: string): Promise<boolean> {
  const key = `provider_health:${capability}:${provider}`;
  const failures = await redis.get(key);
  return !failures || Number(failures) < HEALTH_FAILURE_THRESHOLD;
}

async function recordFailure(provider: string, capability: string): Promise<void> {
  const key = `provider_health:${capability}:${provider}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, HEALTH_WINDOW_SEC);
}

async function isEnabled(provider: string, capability: string): Promise<boolean> {
  const config = await prisma.providerConfig.findUnique({
    where: { capability_provider: { capability, provider } },
  });
  return config ? config.enabled : true;
}

async function logUsage(params: {
  provider: string;
  capability: string;
  model?: string;
  success: boolean;
  estimatedCost: number;
  actualCost?: number;
  durationMs: number;
  errorCode?: string;
  jobId?: string;
  userId?: string;
  projectId?: string;
}): Promise<void> {
  await prisma.providerUsage.create({
    data: {
      provider: params.provider,
      capability: params.capability,
      model: params.model,
      success: params.success,
      estimatedCost: params.estimatedCost,
      actualCost: params.actualCost,
      durationMs: params.durationMs,
      errorCode: params.errorCode,
      jobId: params.jobId,
      userId: params.userId,
      projectId: params.projectId,
    },
  });
}

interface RouterContext {
  jobId?: string;
  userId?: string;
  projectId?: string;
}

async function route<TInput, TOutput>(
  capability: string,
  providers: Array<{ name: string; isAvailable(): boolean }>,
  call: (provider: any) => Promise<ProviderResult<TOutput>>,
  ctx: RouterContext = {},
): Promise<ProviderResult<TOutput>> {
  let lastResult: ProviderResult<TOutput> | null = null;

  for (const provider of providers) {
    if (!provider.isAvailable()) continue;
    if (!(await isEnabled(provider.name, capability))) continue;
    if (!(await isHealthy(provider.name, capability))) continue;

    const result = await call(provider);
    await logUsage({
      provider: provider.name,
      capability,
      model: result.model,
      success: result.success,
      estimatedCost: result.costUnits,
      actualCost: result.success ? result.costUnits : 0,
      durationMs: result.durationMs,
      errorCode: result.error?.code,
      ...ctx,
    });

    if (result.success) return result;

    lastResult = result;
    await recordFailure(provider.name, capability);
    if (result.error && !result.error.retryable) continue; // permanent failure, try next provider anyway
  }

  return (
    lastResult ?? {
      success: false,
      provider: "none",
      kind: "mock",
      costUnits: 0,
      durationMs: 0,
      error: { code: "no_provider_available", message: `No provider available for ${capability}`, retryable: false },
    }
  );
}

export async function routeScriptGeneration(
  input: Parameters<TextGenerationProvider["generateScript"]>[0],
  ctx?: RouterContext,
) {
  return route("text", TEXT_PROVIDERS, (p: TextGenerationProvider) => p.generateScript(input), ctx);
}

export async function routeImageGeneration(
  input: Parameters<ImageGenerationProvider["generateImage"]>[0],
  ctx?: RouterContext,
) {
  return route("image", IMAGE_PROVIDERS, (p: ImageGenerationProvider) => p.generateImage(input), ctx);
}

export async function routeVoiceGeneration(
  input: Parameters<VoiceGenerationProvider["generateVoice"]>[0],
  ctx?: RouterContext,
) {
  return route("voice", VOICE_PROVIDERS, (p: VoiceGenerationProvider) => p.generateVoice(input), ctx);
}
