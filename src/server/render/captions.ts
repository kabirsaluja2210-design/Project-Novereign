import type { Scene, VoiceSegment } from "@prisma/client";

const WORDS_PER_CAPTION = 5;

function formatSrtTime(totalSeconds: number): string {
  const ms = Math.round((totalSeconds % 1) * 1000);
  const totalWholeSeconds = Math.floor(totalSeconds);
  const s = totalWholeSeconds % 60;
  const m = Math.floor(totalWholeSeconds / 60) % 60;
  const h = Math.floor(totalWholeSeconds / 3600);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatVttTime(totalSeconds: number): string {
  return formatSrtTime(totalSeconds).replace(",", ".");
}

interface TimingWord {
  word: string;
  startSec: number;
  endSec: number;
}

interface CaptionCue {
  startSec: number;
  endSec: number;
  text: string;
}

type SceneWithVoice = Scene & { voiceSegment: VoiceSegment | null };

/**
 * Builds word-grouped caption cues across the whole project timeline from
 * each scene's word-level voice timing data, offsetting by cumulative scene
 * duration (directive §25/§136 - word-level timing, SRT + VTT export).
 */
export function buildCaptions(scenes: SceneWithVoice[]): { srt: string; vtt: string; cues: CaptionCue[] } {
  const cues: CaptionCue[] = [];
  let offset = 0;

  for (const scene of scenes) {
    const timingData = (scene.voiceSegment?.timingData as unknown as TimingWord[] | null) ?? [];
    for (let i = 0; i < timingData.length; i += WORDS_PER_CAPTION) {
      const chunk = timingData.slice(i, i + WORDS_PER_CAPTION);
      if (chunk.length === 0) continue;
      cues.push({
        startSec: offset + chunk[0]!.startSec,
        endSec: offset + chunk[chunk.length - 1]!.endSec,
        text: chunk.map((w) => w.word).join(" "),
      });
    }
    offset += scene.durationSec;
  }

  const srt = cues
    .map(
      (cue, i) =>
        `${i + 1}\n${formatSrtTime(cue.startSec)} --> ${formatSrtTime(cue.endSec)}\n${cue.text}\n`,
    )
    .join("\n");

  const vtt =
    "WEBVTT\n\n" +
    cues
      .map((cue) => `${formatVttTime(cue.startSec)} --> ${formatVttTime(cue.endSec)}\n${cue.text}\n`)
      .join("\n");

  return { srt, vtt, cues };
}
