import { describe, expect, it } from "vitest";
import { estimateCredits, OPERATION_COSTS } from "@/server/credits/estimate";

describe("estimateCredits", () => {
  it("computes integer scene counts and never charges fractional credits", () => {
    const est = estimateCredits({
      durationSec: 30,
      captionsEnabled: true,
      musicEnabled: false,
      sfxEnabled: false,
    });
    expect(Number.isInteger(est.sceneCount)).toBe(true);
    expect(est.breakdown.every((b) => Number.isInteger(b.credits))).toBe(true);
    expect(est.estimate).toBe(est.breakdown.reduce((sum, b) => sum + b.credits, 0));
  });

  it("omits optional line items when the corresponding feature is disabled", () => {
    const est = estimateCredits({
      durationSec: 20,
      captionsEnabled: false,
      musicEnabled: false,
      sfxEnabled: false,
    });
    expect(est.breakdown.some((b) => b.label === "Captions")).toBe(false);
    expect(est.breakdown.some((b) => b.label === "Background music")).toBe(false);
    expect(est.breakdown.some((b) => b.label === "Sound effects")).toBe(false);
  });

  it("includes music and sfx costs when enabled", () => {
    const est = estimateCredits({
      durationSec: 20,
      captionsEnabled: true,
      musicEnabled: true,
      sfxEnabled: true,
    });
    expect(est.breakdown.find((b) => b.label === "Background music")?.credits).toBe(
      OPERATION_COSTS.MUSIC_TRACK,
    );
    expect(est.breakdown.some((b) => b.label === "Sound effects")).toBe(true);
  });

  it("scales scene count with duration", () => {
    const short = estimateCredits({ durationSec: 20, captionsEnabled: false, musicEnabled: false, sfxEnabled: false });
    const long = estimateCredits({ durationSec: 300, captionsEnabled: false, musicEnabled: false, sfxEnabled: false });
    expect(long.sceneCount).toBeGreaterThan(short.sceneCount);
    expect(long.estimate).toBeGreaterThan(short.estimate);
  });

  it("low/high range brackets the point estimate", () => {
    const est = estimateCredits({ durationSec: 60, captionsEnabled: true, musicEnabled: true, sfxEnabled: true });
    expect(est.low).toBeLessThanOrEqual(est.estimate);
    expect(est.high).toBeGreaterThanOrEqual(est.estimate);
  });
});
