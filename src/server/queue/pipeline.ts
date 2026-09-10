import { prisma } from "@/server/db";
import { runStep } from "./job-step";
import {
  routeScriptGeneration,
  routeImageGeneration,
  routeVoiceGeneration,
} from "@/server/providers/router";
import { mapWithConcurrency } from "@/server/util/plimit";
import { settleGeneration } from "@/server/credits/ledger";
import { OPERATION_COSTS } from "@/server/credits/estimate";
import { renderProject } from "@/server/render/render";
import { buildCaptions } from "@/server/render/captions";
import { ASPECT_DIMENSIONS } from "@/server/render/dimensions";
import { storageKeyToUrl } from "@/server/storage";

const IMAGE_CONCURRENCY = 3;
const VOICE_CONCURRENCY = 3;
const MAX_SCENE_ATTEMPTS = 2;

/**
 * Runs the full generation pipeline for a Job (directive §6/§7/§199). Each
 * stage is persisted via `runStep` (JobStep rows), so progress survives
 * process restarts and is independently retryable. See ARCHITECTURE.md for
 * the DAG this implements.
 */
export async function runPipeline(dbJobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: dbJobId },
    include: { project: true },
  });

  let actualCostUnits = 0;
  const addCost = (n: number) => {
    actualCostUnits += n;
  };

  await prisma.job.update({
    where: { id: job.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  await prisma.project.update({ where: { id: job.projectId }, data: { status: "GENERATING" } });

  try {
    await runStep(job.id, "script_generation", async () => {
      const sceneCountEstimate = Math.max(1, Math.ceil(job.project.durationSec / 7));
      const result = await routeScriptGeneration(
        {
          idea: job.project.idea,
          durationSec: job.project.durationSec,
          sceneCount: sceneCountEstimate,
          language: job.project.language,
        },
        { jobId: job.id, userId: job.userId, projectId: job.projectId },
      );
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? "Script generation failed");
      }
      addCost(result.costUnits);

      await prisma.project.update({
        where: { id: job.projectId },
        data: { name: result.data.title },
      });

      for (const scene of result.data.scenes) {
        await prisma.scene.upsert({
          where: { projectId_index: { projectId: job.projectId, index: scene.index } },
          create: {
            projectId: job.projectId,
            index: scene.index,
            durationSec: scene.durationSec,
            scriptText: scene.narration,
            visualPrompt: scene.visualPrompt,
            motionPrompt: scene.motionPrompt,
          },
          update: {
            durationSec: scene.durationSec,
            scriptText: scene.narration,
            visualPrompt: scene.visualPrompt,
            motionPrompt: scene.motionPrompt,
          },
        });
      }

      return { provider: result.provider, sceneCount: result.data.scenes.length };
    });

    const scenes = await prisma.scene.findMany({
      where: { projectId: job.projectId },
      orderBy: { index: "asc" },
    });
    const dimensions = ASPECT_DIMENSIONS[job.project.aspectRatio];

    await runStep(job.id, "image_generation", async () => {
      await mapWithConcurrency(scenes, IMAGE_CONCURRENCY, async (scene) => {
        await prisma.scene.update({ where: { id: scene.id }, data: { status: "GENERATING" } });
        let lastError: string | undefined;
        for (let attempt = 1; attempt <= MAX_SCENE_ATTEMPTS; attempt++) {
          const result = await routeImageGeneration(
            {
              prompt: scene.visualPrompt,
              width: dimensions.width,
              height: dimensions.height,
              seed: `${job.projectId}-${scene.index}`,
            },
            { jobId: job.id, userId: job.userId, projectId: job.projectId },
          );
          if (result.success && result.data) {
            addCost(result.costUnits);
            const media = await prisma.media.create({
              data: {
                projectId: job.projectId,
                type: "IMAGE",
                provider: result.provider,
                providerKind: result.kind,
                storageUrl: storageKeyToUrl(result.data.storageKey),
                width: result.data.width,
                height: result.data.height,
                mimeType: "image/png",
                prompt: scene.visualPrompt,
                seed: `${job.projectId}-${scene.index}`,
                costUnits: result.costUnits,
              },
            });
            await prisma.scene.update({
              where: { id: scene.id },
              data: { status: "READY", mediaId: media.id },
            });
            return;
          }
          lastError = result.error?.message;
        }
        await prisma.scene.update({
          where: { id: scene.id },
          data: { status: "FAILED", errorMessage: lastError },
        });
        throw new Error(`Scene ${scene.index} image generation failed: ${lastError}`);
      });
    });

    await runStep(job.id, "voice_generation", async () => {
      await mapWithConcurrency(scenes, VOICE_CONCURRENCY, async (scene) => {
        let lastError: string | undefined;
        for (let attempt = 1; attempt <= MAX_SCENE_ATTEMPTS; attempt++) {
          const result = await routeVoiceGeneration(
            {
              text: scene.scriptText,
              voiceProviderVoiceId: job.project.voiceId ?? undefined,
              language: job.project.language,
            },
            { jobId: job.id, userId: job.userId, projectId: job.projectId },
          );
          if (result.success && result.data) {
            addCost(result.costUnits);
            const voiceSegment = await prisma.voiceSegment.create({
              data: {
                projectId: job.projectId,
                text: scene.scriptText,
                provider: result.provider,
                providerKind: result.kind,
                voiceId: job.project.voiceId,
                audioUrl: storageKeyToUrl(result.data.storageKey),
                durationSec: result.data.durationSec,
                timingData: result.data.timingData as unknown as object,
                costUnits: result.costUnits,
              },
            });
            await prisma.scene.update({
              where: { id: scene.id },
              data: { voiceSegmentId: voiceSegment.id, durationSec: result.data.durationSec },
            });
            return;
          }
          lastError = result.error?.message;
        }
        throw new Error(`Scene ${scene.index} voice generation failed: ${lastError}`);
      });
    });

    const captionArtifact = await runStep(job.id, "caption_generation", async () => {
      const freshScenes = await prisma.scene.findMany({
        where: { projectId: job.projectId },
        orderBy: { index: "asc" },
        include: { voiceSegment: true },
      });
      return buildCaptions(freshScenes);
    });

    await runStep(job.id, "render", async () => {
      const freshScenes = await prisma.scene.findMany({
        where: { projectId: job.projectId },
        orderBy: { index: "asc" },
        include: { media: true, voiceSegment: true },
      });
      const rendered = await renderProject({
        project: job.project,
        scenes: freshScenes,
        captionsSrt: job.project.captionsEnabled ? captionArtifact.srt : undefined,
      });
      addCost(OPERATION_COSTS.RENDER_BASE);
      await prisma.project.update({
        where: { id: job.projectId },
        data: {
          status: "READY",
          finalVideoUrl: rendered.videoUrl,
          thumbnailUrl: rendered.thumbnailUrl,
          creditActual: actualCostUnits,
        },
      });
      return { videoUrl: rendered.videoUrl };
    });

    if (job.reservationTxnId) {
      await settleGeneration({ reservationTxnId: job.reservationTxnId, actualAmount: actualCostUnits });
    }

    await prisma.job.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await prisma.project.update({
      where: { id: job.projectId },
      data: { status: "FAILED", errorMessage: message, creditActual: actualCostUnits },
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: message },
    });

    if (job.reservationTxnId) {
      await settleGeneration({
        reservationTxnId: job.reservationTxnId,
        actualAmount: actualCostUnits,
      });
    }

    throw error;
  }
}
