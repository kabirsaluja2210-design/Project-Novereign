import { createHash } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { promises as fs } from "fs";
import type { ProviderResult, VoiceGenerationProvider, VoiceOutput, VoiceRequest } from "../types";
import { OPERATION_COSTS } from "@/server/credits/estimate";
import { runFfmpeg } from "@/server/ffmpeg/exec";
import { getStorage } from "@/server/storage";

const WORDS_PER_SECOND = 2.5; // ~150 wpm average narration pace
const MIN_DURATION_SEC = 1.2;

function estimateDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_DURATION_SEC, Math.round((words / WORDS_PER_SECOND) * 10) / 10);
}

/**
 * MOCK voice provider: synthesizes a soft, warbling placeholder tone (not
 * real speech) whose duration matches an estimate of natural speaking pace
 * for the given text, with evenly-spaced word timing. This lets the full
 * pipeline (timing, captions, render, credit accounting) run and be tested
 * end-to-end without a paid TTS API. Swap in a real adapter (ElevenLabs, AWS
 * Polly, etc.) behind an API key - see PROVIDERS.md.
 */
export class MockVoiceProvider implements VoiceGenerationProvider {
  name = "mock";
  kind = "mock" as const;

  isAvailable(): boolean {
    return true;
  }

  async generateVoice(input: VoiceRequest): Promise<ProviderResult<VoiceOutput>> {
    const start = Date.now();
    const durationSec = estimateDurationSec(input.text);
    const words = input.text.trim().split(/\s+/).filter(Boolean);
    const perWord = durationSec / Math.max(1, words.length);
    const timingData = words.map((word, i) => ({
      word,
      startSec: Math.round(i * perWord * 100) / 100,
      endSec: Math.round((i + 1) * perWord * 100) / 100,
    }));

    // Deterministic pitch per voice id so different voice choices sound
    // audibly different even though none of them are "real" speech.
    const hash = createHash("md5").update(input.voiceProviderVoiceId ?? "default").digest();
    const baseFreq = 140 + (hash[0]! % 80);

    const tmpFile = path.join(
      tmpdir(),
      `mock-voice-${createHash("md5").update(input.text + Date.now()).digest("hex")}.mp3`,
    );

    try {
      await runFfmpeg([
        "-f", "lavfi",
        "-i", `sine=frequency=${baseFreq}:duration=${durationSec}`,
        "-af", "tremolo=f=6:d=0.6,volume=0.18,afade=t=in:d=0.1,afade=t=out:st=" +
          Math.max(0, durationSec - 0.15) + ":d=0.15",
        "-codec:a", "libmp3lame",
        "-b:a", "96k",
        tmpFile,
      ]);

      const data = await fs.readFile(tmpFile);
      await fs.rm(tmpFile, { force: true });

      const storage = getStorage();
      const key = `media/voice/${createHash("md5").update(input.text).digest("hex")}-${Date.now()}.mp3`;
      await storage.put(key, data, "audio/mpeg");

      return {
        success: true,
        provider: this.name,
        kind: this.kind,
        model: "placeholder-tone-v1",
        costUnits: Math.ceil(durationSec * OPERATION_COSTS.VOICE_PER_SECOND),
        durationMs: Date.now() - start,
        data: { storageKey: key, durationSec, timingData },
      };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        kind: this.kind,
        costUnits: 0,
        durationMs: Date.now() - start,
        error: {
          code: "render_failed",
          message: err instanceof Error ? err.message : "Unknown error",
          retryable: true,
        },
      };
    }
  }
}
