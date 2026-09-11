import path from "path";
import { promises as fs } from "fs";
import os from "os";
import type { Media, Project, Scene, VoiceSegment } from "@prisma/client";
import { runFfmpeg } from "@/server/ffmpeg/exec";
import { getStorage } from "@/server/storage";
import { urlToLocalStorageKey } from "@/server/storage/keys";
import { ASPECT_DIMENSIONS } from "./dimensions";

type SceneWithAssets = Scene & { media: Media | null; voiceSegment: VoiceSegment | null };

export interface RenderInput {
  project: Project;
  scenes: SceneWithAssets[];
  captionsSrt?: string;
}

export interface RenderOutput {
  videoUrl: string;
  thumbnailUrl: string;
}

const FPS = 30;

function roundToEven(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

async function copyToLocalTmp(storageUrl: string, destPath: string): Promise<void> {
  const storage = getStorage();
  const key = urlToLocalStorageKey(storageUrl);
  const data = await storage.read(key);
  await fs.writeFile(destPath, data);
}

/**
 * Renders a finished project to MP4 using a Ken Burns (slow zoom) effect over
 * each scene's still image, muxed with that scene's narration, concatenated,
 * with burned-in captions and loudness-normalized audio (directive §31/§136/
 * §139/§175). Transitions between scenes are currently hard cuts rather than
 * true crossfades - the `Scene.transition` field is stored for a follow-up
 * that adds an xfade filtergraph; see CLAUDE_PROGRESS.md.
 */
export async function renderProject(input: RenderInput): Promise<RenderOutput> {
  const { project, scenes, captionsSrt } = input;
  const dimensions = ASPECT_DIMENSIONS[project.aspectRatio];
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "clipforge-render-"));

  try {
    const sceneClipPaths: string[] = [];

    for (const scene of scenes) {
      if (!scene.media || !scene.voiceSegment) {
        throw new Error(`Scene ${scene.index} is missing generated media or voice`);
      }

      const imagePath = path.join(workDir, `scene-${scene.index}-image.png`);
      const audioPath = path.join(workDir, `scene-${scene.index}-audio.mp3`);
      const clipPath = path.join(workDir, `scene-${scene.index}-clip.mp4`);

      await copyToLocalTmp(scene.media.storageUrl, imagePath);
      await copyToLocalTmp(scene.voiceSegment.audioUrl, audioPath);

      const durationSec = Math.max(0.5, scene.durationSec);
      const frames = Math.max(1, Math.round(durationSec * FPS));
      const scaledW = roundToEven(dimensions.width * 1.15);
      const scaledH = roundToEven(dimensions.height * 1.15);

      const zoompanFilter = [
        `[0:v]scale=${scaledW}:${scaledH}`,
        `zoompan=z='min(zoom+0.0006,1.15)':d=${frames}:s=${dimensions.width}x${dimensions.height}:fps=${FPS}`,
        `format=yuv420p[v]`,
      ].join(",");

      await runFfmpeg([
        "-loop", "1",
        "-i", imagePath,
        "-i", audioPath,
        "-filter_complex", zoompanFilter,
        "-map", "[v]",
        "-map", "1:a:0",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-c:a", "aac",
        "-b:a", "128k",
        "-t", durationSec.toFixed(2),
        "-shortest",
        clipPath,
      ]);

      sceneClipPaths.push(clipPath);
    }

    const concatListPath = path.join(workDir, "concat.txt");
    await fs.writeFile(
      concatListPath,
      sceneClipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    );

    const concatenatedPath = path.join(workDir, "concatenated.mp4");
    await runFfmpeg([
      "-f", "concat",
      "-safe", "0",
      "-i", concatListPath,
      "-c", "copy",
      concatenatedPath,
    ]);

    const finalPath = path.join(workDir, "final.mp4");
    const videoFilters: string[] = [];

    let srtPath: string | null = null;
    if (captionsSrt && captionsSrt.trim().length > 0) {
      srtPath = path.join(workDir, "captions.srt");
      await fs.writeFile(srtPath, captionsSrt);
      const escapedSrtPath = srtPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
      videoFilters.push(
        `subtitles=${escapedSrtPath}:force_style='FontName=DejaVu Sans,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=90'`,
      );
    }

    const finalArgs = ["-i", concatenatedPath];
    if (videoFilters.length > 0) {
      finalArgs.push("-vf", videoFilters.join(","));
    }
    finalArgs.push(
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      finalPath,
    );

    await runFfmpeg(finalArgs);

    const thumbnailPath = path.join(workDir, "thumbnail.jpg");
    const totalDuration = scenes.reduce((sum, s) => sum + s.durationSec, 0);
    const thumbnailAt = Math.min(1, Math.max(0, totalDuration / 3));
    await runFfmpeg([
      "-ss", thumbnailAt.toFixed(2),
      "-i", finalPath,
      "-frames:v", "1",
      thumbnailPath,
    ]);

    const storage = getStorage();
    const timestamp = Date.now();
    const videoKey = `renders/${project.id}/${timestamp}.mp4`;
    const thumbnailKey = `renders/${project.id}/${timestamp}-thumb.jpg`;

    const videoData = await fs.readFile(finalPath);
    const thumbnailData = await fs.readFile(thumbnailPath);

    const videoUrl = await storage.put(videoKey, videoData, "video/mp4");
    const thumbnailUrl = await storage.put(thumbnailKey, thumbnailData, "image/jpeg");

    return { videoUrl, thumbnailUrl };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
