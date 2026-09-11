import { createHash } from "crypto";
import type { ProviderResult, VoiceGenerationProvider, VoiceOutput, VoiceRequest } from "../types";
import { OPERATION_COSTS } from "@/server/credits/estimate";
import { getStorage } from "@/server/storage";

/**
 * REAL provider adapter. Requires ELEVENLABS_API_KEY. Not exercised in this
 * sandbox (no key configured here) - see PROVIDERS.md. Uses ElevenLabs'
 * `with-timestamps` endpoint so caption/render timing is driven by real
 * character-level alignment instead of the mock's evenly-spaced estimate.
 *
 * Voice selection: the seeded Voice catalog only has "mock" provider rows
 * today (directive-scope decision - see PRODUCT_SPEC.md roadmap on seeding
 * a real per-provider voice catalog). Until that catalog is populated with
 * ElevenLabs voice ids, this adapter falls back to a fixed well-known
 * premade voice ("Rachel") regardless of the user's voice selection - a
 * known limitation, not a bug, until real voice rows are seeded.
 */

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs premade voice "Rachel"
const MODEL_ID = "eleven_multilingual_v2";

interface ElevenLabsTimestampResponse {
  audio_base64: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

export class ElevenLabsVoiceProvider implements VoiceGenerationProvider {
  name = "elevenlabs";
  kind = "real" as const;

  isAvailable(): boolean {
    return Boolean(process.env.ELEVENLABS_API_KEY);
  }

  async generateVoice(input: VoiceRequest): Promise<ProviderResult<VoiceOutput>> {
    const start = Date.now();
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        provider: this.name,
        kind: this.kind,
        costUnits: 0,
        durationMs: Date.now() - start,
        error: { code: "no_api_key", message: "ELEVENLABS_API_KEY not configured", retryable: false },
      };
    }

    const voiceId = isElevenLabsVoiceId(input.voiceProviderVoiceId)
      ? input.voiceProviderVoiceId!
      : DEFAULT_VOICE_ID;

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ text: input.text, model_id: MODEL_ID }),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          provider: this.name,
          kind: this.kind,
          costUnits: 0,
          durationMs: Date.now() - start,
          error: {
            code: `http_${res.status}`,
            message: `ElevenLabs API error: ${text.slice(0, 300)}`,
            retryable: res.status >= 500 || res.status === 429,
          },
        };
      }

      const json = (await res.json()) as ElevenLabsTimestampResponse;
      const audioBuffer = Buffer.from(json.audio_base64, "base64");

      const timingData = json.alignment
        ? groupCharactersIntoWords(
            input.text,
            json.alignment.characters,
            json.alignment.character_start_times_seconds,
            json.alignment.character_end_times_seconds,
          )
        : estimateWordTiming(input.text);

      const durationSec =
        timingData.length > 0 ? timingData[timingData.length - 1]!.endSec : estimateDuration(input.text);

      const storage = getStorage();
      const key = `media/voice/${createHash("md5").update(input.text).digest("hex")}-${Date.now()}.mp3`;
      await storage.put(key, audioBuffer, "audio/mpeg");

      return {
        success: true,
        provider: this.name,
        kind: this.kind,
        model: MODEL_ID,
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
          code: "network_error",
          message: err instanceof Error ? err.message : "Unknown error",
          retryable: true,
        },
      };
    }
  }
}

function isElevenLabsVoiceId(id: string | undefined): boolean {
  // ElevenLabs voice ids are ~20-char alphanumeric strings, unlike our
  // seeded "mock-*" voice ids - a cheap heuristic to avoid passing a mock
  // voice id straight through to a real API call.
  return Boolean(id && !id.startsWith("mock-") && /^[A-Za-z0-9]{15,30}$/.test(id));
}

/** Converts ElevenLabs' character-level alignment into word-level timing cues. */
function groupCharactersIntoWords(
  text: string,
  characters: string[],
  startTimes: number[],
  endTimes: number[],
): Array<{ word: string; startSec: number; endSec: number }> {
  const words: Array<{ word: string; startSec: number; endSec: number }> = [];
  let currentWord = "";
  let wordStart: number | null = null;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i]!;
    if (/\s/.test(char)) {
      if (currentWord) {
        words.push({ word: currentWord, startSec: wordStart!, endSec: endTimes[i - 1]! });
        currentWord = "";
        wordStart = null;
      }
      continue;
    }
    if (wordStart === null) wordStart = startTimes[i]!;
    currentWord += char;
  }
  if (currentWord && wordStart !== null) {
    words.push({ word: currentWord, startSec: wordStart, endSec: endTimes[endTimes.length - 1]! });
  }
  return words;
}

const WORDS_PER_SECOND = 2.5;

function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, words / WORDS_PER_SECOND);
}

/** Fallback if ElevenLabs ever omits alignment data for a request. */
function estimateWordTiming(text: string): Array<{ word: string; startSec: number; endSec: number }> {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const duration = estimateDuration(text);
  const perWord = duration / Math.max(1, words.length);
  return words.map((word, i) => ({
    word,
    startSec: Math.round(i * perWord * 100) / 100,
    endSec: Math.round((i + 1) * perWord * 100) / 100,
  }));
}
