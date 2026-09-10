import { describe, expect, it } from "vitest";
import { MockImageProvider } from "@/server/providers/image/mock";
import { MockVoiceProvider } from "@/server/providers/voice/mock";
import { MockTextProvider } from "@/server/providers/text/mock";
import { getStorage } from "@/server/storage";

/**
 * These call the real ffmpeg-backed mock adapters (not stubs) and assert the
 * files they claim to have written actually exist and are non-trivial in
 * size - catching the class of bug where a provider reports success without
 * producing a usable asset.
 */

describe("MockTextProvider", () => {
  it("produces a scene breakdown that sums close to the requested duration", async () => {
    const provider = new MockTextProvider();
    const result = await provider.generateScript({
      idea: "A robot learns to paint",
      durationSec: 40,
      sceneCount: 6,
      language: "en",
    });
    expect(result.success).toBe(true);
    expect(result.data!.scenes).toHaveLength(6);
    const totalDuration = result.data!.scenes.reduce((sum, s) => sum + s.durationSec, 0);
    expect(totalDuration).toBeGreaterThan(35);
    expect(totalDuration).toBeLessThan(45);
    for (const scene of result.data!.scenes) {
      expect(scene.narration.length).toBeGreaterThan(0);
      expect(scene.visualPrompt.length).toBeGreaterThan(0);
    }
  });
});

describe("MockImageProvider", () => {
  it("writes a real, non-empty PNG file to storage", async () => {
    const provider = new MockImageProvider();
    const result = await provider.generateImage({
      prompt: "a lighthouse at night, storm approaching",
      width: 1080,
      height: 1920,
    });
    expect(result.success).toBe(true);
    const storage = getStorage();
    const buffer = await storage.read(result.data!.storageKey);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 4).toString("hex")).toBe("89504e47"); // PNG magic bytes
  });
});

describe("MockVoiceProvider", () => {
  it("synthesizes audio whose duration scales with text length", async () => {
    const provider = new MockVoiceProvider();
    const short = await provider.generateVoice({ text: "Hello there.", language: "en" });
    const long = await provider.generateVoice({
      text: "This is a much longer sentence that should take noticeably more time to speak aloud than the short one.",
      language: "en",
    });
    expect(short.success).toBe(true);
    expect(long.success).toBe(true);
    expect(long.data!.durationSec).toBeGreaterThan(short.data!.durationSec);
    expect(long.data!.timingData.length).toBeGreaterThan(short.data!.timingData.length);

    const storage = getStorage();
    const buffer = await storage.read(long.data!.storageKey);
    expect(buffer.length).toBeGreaterThan(500);
  });
});
