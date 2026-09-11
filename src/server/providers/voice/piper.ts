import { createHash } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { promises as fs, existsSync } from "fs";
import { spawn } from "child_process";
import type { ProviderResult, VoiceGenerationProvider, VoiceOutput, VoiceRequest } from "../types";
import { OPERATION_COSTS } from "@/server/credits/estimate";
import { getStorage } from "@/server/storage";
import { runFfprobe } from "@/server/ffmpeg/exec";

/**
 * REAL, fully local provider adapter - no API key, no account, no per-request
 * cost, no internet access at runtime. Requires the `piper` binary and a
 * voice model (.onnx + .onnx.json) to be present in the image/host - see the
 * Dockerfile, which downloads both at BUILD time only (directive-relevant:
 * this satisfies "no APIs needed" for actual generation, since nothing is
 * called over the network once the container is running).
 *
 * Piper (https://github.com/rhasspy/piper) is a fast, offline neural TTS
 * engine that runs on CPU. It does not expose word-level timestamps through
 * its CLI, so timing here is evenly distributed across the *real, measured*
 * output duration (via ffprobe) - more accurate than the Mock provider's
 * word-count estimate, though not phoneme-accurate like ElevenLabs' real
 * alignment data.
 *
 * Honesty note: the Piper binary/model download URLs in the Dockerfile were
 * written from documented, historically stable release/asset naming but
 * could NOT be verified live in this sandbox (GitHub releases and
 * huggingface.co both returned 403 here due to this environment's network
 * policy - see PROVIDERS.md). If the Docker build 404s on the Piper
 * download step, the release tag or asset filename has likely moved; check
 * https://github.com/rhasspy/piper/releases and update the Dockerfile's
 * PIPER_VERSION/PIPER_ASSET build args.
 */

const PIPER_BINARY = process.env.PIPER_BINARY_PATH ?? "/opt/piper/piper";
const PIPER_MODEL = process.env.PIPER_MODEL_PATH ?? "/opt/piper/voices/en_US-lessac-medium.onnx";

export class PiperVoiceProvider implements VoiceGenerationProvider {
  name = "piper";
  kind = "real" as const;

  isAvailable(): boolean {
    return existsSync(PIPER_BINARY) && existsSync(PIPER_MODEL);
  }

  async generateVoice(input: VoiceRequest): Promise<ProviderResult<VoiceOutput>> {
    const start = Date.now();
    const tmpFile = path.join(
      tmpdir(),
      `piper-${createHash("md5").update(input.text + Date.now()).digest("hex")}.wav`,
    );

    try {
      await runPiper(input.text, tmpFile);

      const probeOutput = await runFfprobe([
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        tmpFile,
      ]);
      const durationSec = Math.max(0.1, parseFloat(probeOutput.trim()) || estimateDuration(input.text));

      const words = input.text.trim().split(/\s+/).filter(Boolean);
      const perWord = durationSec / Math.max(1, words.length);
      const timingData = words.map((word, i) => ({
        word,
        startSec: Math.round(i * perWord * 100) / 100,
        endSec: Math.round((i + 1) * perWord * 100) / 100,
      }));

      const data = await fs.readFile(tmpFile);
      await fs.rm(tmpFile, { force: true });

      const storage = getStorage();
      const key = `media/voice/${createHash("md5").update(input.text).digest("hex")}-${Date.now()}.wav`;
      await storage.put(key, data, "audio/wav");

      return {
        success: true,
        provider: this.name,
        kind: this.kind,
        model: path.basename(PIPER_MODEL),
        costUnits: Math.ceil(durationSec * OPERATION_COSTS.VOICE_PER_SECOND),
        durationMs: Date.now() - start,
        data: { storageKey: key, durationSec, timingData },
      };
    } catch (err) {
      await fs.rm(tmpFile, { force: true }).catch(() => {});
      return {
        success: false,
        provider: this.name,
        kind: this.kind,
        costUnits: 0,
        durationMs: Date.now() - start,
        error: {
          code: "local_synthesis_failed",
          message: err instanceof Error ? err.message : "Unknown error",
          retryable: true,
        },
      };
    }
  }
}

function runPiper(text: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PIPER_BINARY, ["--model", PIPER_MODEL, "--output_file", outputFile], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`piper exited with code ${code}: ${stderr.slice(-1000)}`));
    });
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

const WORDS_PER_SECOND = 2.5;
function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, words / WORDS_PER_SECOND);
}
