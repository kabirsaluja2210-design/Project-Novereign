import { createHash } from "crypto";
import type { ImageGenerationProvider, ImageOutput, ImageRequest, ProviderResult } from "../types";
import { OPERATION_COSTS } from "@/server/credits/estimate";
import { getStorage } from "@/server/storage";

/**
 * REAL provider adapter. Requires REPLICATE_API_TOKEN. Not exercised in this
 * sandbox (no key configured here) - see PROVIDERS.md. Uses Replicate's
 * "official model" shorthand endpoint (no version hash needed) for
 * black-forest-labs/flux-schnell - fast and inexpensive, a reasonable
 * default for scene-image generation. Swap the model path below for a
 * different Replicate model if desired.
 */

const MODEL_OWNER = "black-forest-labs";
const MODEL_NAME = "flux-schnell";
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90_000;

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string[] | string | null;
  error?: string | null;
  urls?: { get?: string };
}

export class ReplicateImageProvider implements ImageGenerationProvider {
  name = "replicate";
  kind = "real" as const;

  isAvailable(): boolean {
    return Boolean(process.env.REPLICATE_API_TOKEN);
  }

  async generateImage(input: ImageRequest): Promise<ProviderResult<ImageOutput>> {
    const start = Date.now();
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      return {
        success: false,
        provider: this.name,
        kind: this.kind,
        costUnits: 0,
        durationMs: Date.now() - start,
        error: { code: "no_api_key", message: "REPLICATE_API_TOKEN not configured", retryable: false },
      };
    }

    try {
      const prompt = input.negativePrompt
        ? `${input.prompt}. Avoid: ${input.negativePrompt}`
        : input.prompt;

      const aspectRatio = closestAspectRatio(input.width, input.height);

      const createRes = await fetch(
        `https://api.replicate.com/v1/models/${MODEL_OWNER}/${MODEL_NAME}/predictions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Prefer: "wait=1",
          },
          body: JSON.stringify({
            input: {
              prompt,
              aspect_ratio: aspectRatio,
              output_format: "png",
              ...(input.seed ? { seed: seedToInt(input.seed) } : {}),
            },
          }),
        },
      );

      if (!createRes.ok) {
        const text = await createRes.text();
        return {
          success: false,
          provider: this.name,
          kind: this.kind,
          costUnits: 0,
          durationMs: Date.now() - start,
          error: {
            code: `http_${createRes.status}`,
            message: `Replicate API error: ${text.slice(0, 300)}`,
            retryable: createRes.status >= 500 || createRes.status === 429,
          },
        };
      }

      let prediction = (await createRes.json()) as ReplicatePrediction;
      prediction = await pollUntilDone(prediction, apiKey, start);

      if (prediction.status !== "succeeded" || !prediction.output) {
        return {
          success: false,
          provider: this.name,
          kind: this.kind,
          costUnits: 0,
          durationMs: Date.now() - start,
          error: {
            code: prediction.status === "failed" ? "generation_failed" : "timeout",
            message: prediction.error ?? `Prediction ended with status: ${prediction.status}`,
            retryable: true,
          },
        };
      }

      const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!imageUrl) {
        return {
          success: false,
          provider: this.name,
          kind: this.kind,
          costUnits: 0,
          durationMs: Date.now() - start,
          error: { code: "no_output", message: "Replicate returned no image URL", retryable: true },
        };
      }

      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        return {
          success: false,
          provider: this.name,
          kind: this.kind,
          costUnits: 0,
          durationMs: Date.now() - start,
          error: { code: "download_failed", message: "Failed to download generated image", retryable: true },
        };
      }
      const data = Buffer.from(await imageRes.arrayBuffer());

      const storage = getStorage();
      const key = `media/images/${createHash("md5").update(input.prompt + Date.now()).digest("hex")}.png`;
      await storage.put(key, data, "image/png");

      return {
        success: true,
        provider: this.name,
        kind: this.kind,
        model: `${MODEL_OWNER}/${MODEL_NAME}`,
        providerJobId: prediction.id,
        costUnits: OPERATION_COSTS.IMAGE_PER_SCENE,
        durationMs: Date.now() - start,
        data: { storageKey: key, width: input.width, height: input.height },
      };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        kind: this.kind,
        costUnits: 0,
        durationMs: Date.now() - start,
        error: {
          code: "network_error",
          message: err instanceof Error ? err.message : "Unknown error",
          retryable: true,
        },
      };
    }
  }
}

async function pollUntilDone(
  prediction: ReplicatePrediction,
  apiKey: string,
  start: number,
): Promise<ReplicatePrediction> {
  let current = prediction;
  while (
    (current.status === "starting" || current.status === "processing") &&
    Date.now() - start < POLL_TIMEOUT_MS
  ) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const url = current.urls?.get ?? `https://api.replicate.com/v1/predictions/${current.id}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) break;
    current = (await res.json()) as ReplicatePrediction;
  }
  return current;
}

/** Replicate's flux-schnell takes a coarse aspect_ratio enum rather than exact pixels. */
function closestAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  const options: Array<[string, number]> = [
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["3:2", 3 / 2],
    ["2:3", 2 / 3],
  ];
  let best = options[0]!;
  let bestDiff = Infinity;
  for (const option of options) {
    const diff = Math.abs(option[1] - ratio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = option;
    }
  }
  return best[0];
}

function seedToInt(seed: string): number {
  const hash = createHash("md5").update(seed).digest();
  return hash.readUInt32BE(0) % 2_147_483_647;
}
