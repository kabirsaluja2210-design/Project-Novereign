import { createHash } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { promises as fs } from "fs";
import type { ImageGenerationProvider, ImageOutput, ImageRequest, ProviderResult } from "../types";
import { OPERATION_COSTS } from "@/server/credits/estimate";
import { runFfmpeg, escapeFfmpegText, DEFAULT_FONT_PATH } from "@/server/ffmpeg/exec";
import { getStorage } from "@/server/storage";

// A small deterministic palette so the same prompt always renders in the
// same color, and different prompts visibly differ - a real generative
// substitute for "a picture", clearly labeled as a MOCK asset.
const PALETTE = [
  "0x1f2937", "0x312e81", "0x7c2d12", "0x134e4a",
  "0x581c87", "0x1e3a8a", "0x14532d", "0x7f1d1d",
];

function colorForPrompt(prompt: string): string {
  const hash = createHash("sha256").update(prompt).digest();
  return PALETTE[hash[0]! % PALETTE.length]!;
}

function wrapText(text: string, maxCharsPerLine: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxCharsPerLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 6).join("\n");
}

/**
 * MOCK image provider: renders a labeled placeholder frame via ffmpeg's
 * lavfi color source + drawtext filter, deterministic per-prompt so
 * regeneration with the same prompt/seed is reproducible (directive §201).
 * This is a real, working adapter - it is just not a generative model.
 */
export class MockImageProvider implements ImageGenerationProvider {
  name = "mock";
  kind = "mock" as const;

  isAvailable(): boolean {
    return true;
  }

  async generateImage(input: ImageRequest): Promise<ProviderResult<ImageOutput>> {
    const start = Date.now();
    const color = colorForPrompt(input.seed ?? input.prompt);
    const label = wrapText(input.prompt, 32);
    const tmpFile = path.join(tmpdir(), `mock-image-${createHash("md5").update(input.prompt + Date.now()).digest("hex")}.png`);

    const drawtext = [
      `drawtext=fontfile=${DEFAULT_FONT_PATH}`,
      `text='${escapeFfmpegText(label)}'`,
      "fontcolor=white",
      "fontsize=42",
      "line_spacing=12",
      "x=(w-text_w)/2",
      "y=(h-text_h)/2",
      "box=1",
      "boxcolor=black@0.35",
      "boxborderw=20",
    ].join(":");

    const watermark = [
      `drawtext=fontfile=${DEFAULT_FONT_PATH}`,
      "text='MOCK IMAGE PROVIDER'",
      "fontcolor=white@0.6",
      "fontsize=24",
      "x=24",
      "y=24",
    ].join(":");

    try {
      await runFfmpeg([
        "-f", "lavfi",
        "-i", `color=c=${color}:s=${input.width}x${input.height}:d=1`,
        "-vf", `${drawtext},${watermark}`,
        "-frames:v", "1",
        tmpFile,
      ]);

      const data = await fs.readFile(tmpFile);
      await fs.rm(tmpFile, { force: true });

      const storage = getStorage();
      const key = `media/images/${createHash("md5").update(input.prompt).digest("hex")}-${Date.now()}.png`;
      await storage.put(key, data, "image/png");

      return {
        success: true,
        provider: this.name,
        kind: this.kind,
        model: "ffmpeg-placeholder-v1",
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
          code: "render_failed",
          message: err instanceof Error ? err.message : "Unknown error",
          retryable: true,
        },
      };
    }
  }
}
