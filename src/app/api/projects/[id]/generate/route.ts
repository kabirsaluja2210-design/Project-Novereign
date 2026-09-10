import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireSession, requireOwnedProject } from "@/server/auth/session";
import { reserveCredits } from "@/server/credits/ledger";
import { estimateCredits } from "@/server/credits/estimate";
import { PIPELINE_STAGES } from "@/server/queue/stages";
import { enqueueGenerationJob } from "@/server/queue/queue";
import { toErrorResponse } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

const generateSchema = z.object({
  clientRequestId: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await context.params;
    const user = await requireSession();
    const project = await requireOwnedProject(projectId, user.id);

    const { allowed } = await rateLimit(`generate:${user.id}`, 20, 60 * 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many generation requests. Try again later." },
        { status: 429 },
      );
    }

    const body = generateSchema.parse(await req.json().catch(() => ({})));

    // Idempotency (directive §76): a repeated request with the same
    // clientRequestId returns the existing job instead of double-charging.
    if (body.clientRequestId) {
      const existingJob = await prisma.job.findUnique({
        where: { clientRequestId: body.clientRequestId },
      });
      if (existingJob) {
        return NextResponse.json({ jobId: existingJob.id, projectId: existingJob.projectId });
      }
    }

    if (project.status === "GENERATING") {
      return NextResponse.json(
        { error: "already_generating", message: "This project is already generating." },
        { status: 409 },
      );
    }

    const estimate = estimateCredits({
      durationSec: project.durationSec,
      captionsEnabled: project.captionsEnabled,
      musicEnabled: project.musicEnabled,
      sfxEnabled: project.sfxEnabled,
    });

    // Reservation + job creation happen in one transaction so credits are
    // never deducted without a corresponding job to spend them (directive
    // §122): a crash between the two would otherwise strand a debit with no
    // way to complete or refund it.
    const { job } = await prisma.$transaction(async (tx) => {
      const reservation = await reserveCredits(
        {
          userId: user.id,
          amount: estimate.estimate,
          source: "quick_create",
          referenceId: projectId,
          description: `Reservation for "${project.name}"`,
        },
        tx,
      );

      const createdJob = await tx.job.create({
        data: {
          userId: user.id,
          projectId,
          type: "video_generation",
          status: "QUEUED",
          reservationTxnId: reservation.reservationTxnId,
          clientRequestId: body.clientRequestId,
        },
      });

      await tx.jobStep.createMany({
        data: PIPELINE_STAGES.map((stage, i) => ({
          jobId: createdJob.id,
          stage,
          sequence: i,
          status: "QUEUED" as const,
        })),
      });

      await tx.project.update({
        where: { id: projectId },
        data: { creditEstimate: estimate.estimate, status: "GENERATING" },
      });

      return { job: createdJob };
    });

    await enqueueGenerationJob({ jobId: job.id });

    return NextResponse.json({ jobId: job.id, projectId, estimate });
  } catch (error) {
    return toErrorResponse(error);
  }
}
