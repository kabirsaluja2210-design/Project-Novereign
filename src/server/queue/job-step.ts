import { prisma } from "@/server/db";
import type { PipelineStage } from "./stages";
import type { Prisma } from "@prisma/client";

export async function runStep<T>(
  jobId: string,
  stage: PipelineStage,
  fn: () => Promise<T>,
): Promise<T> {
  await prisma.jobStep.update({
    where: { jobId_stage: { jobId, stage } },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });

  try {
    const output = await fn();
    await prisma.jobStep.update({
      where: { jobId_stage: { jobId, stage } },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        output: (output ?? null) as Prisma.InputJsonValue,
      },
    });
    return output;
  } catch (error) {
    await prisma.jobStep.update({
      where: { jobId_stage: { jobId, stage } },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
