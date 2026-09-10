import { prisma } from "@/server/db";
import { requireSession, requireOwnedJob } from "@/server/auth/session";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 1200;

/**
 * SSE progress feed (directive §56/§57). Backed by DB polling rather than a
 * push mechanism from the worker - simpler operationally for a single-writer
 * progress feed, and it means a client that reconnects after a dropped
 * connection just re-reads current state from Postgres with no special
 * resume logic (directive §56 "reconnect and restore state from database").
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await context.params;
  const user = await requireSession();
  await requireOwnedJob(jobId, user.id);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const tick = async () => {
        if (closed) return;
        try {
          const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: { steps: { orderBy: { sequence: "asc" } }, project: true },
          });
          if (!job) {
            send("job_failed", { message: "Job not found" });
            controller.close();
            closed = true;
            return;
          }

          send("stage_progress", {
            status: job.status,
            steps: job.steps.map((s) => ({
              stage: s.stage,
              status: s.status,
              lastError: s.lastError,
            })),
            project: {
              id: job.project.id,
              status: job.project.status,
              finalVideoUrl: job.project.finalVideoUrl,
              thumbnailUrl: job.project.thumbnailUrl,
              errorMessage: job.project.errorMessage,
            },
          });

          if (job.status === "SUCCEEDED" || job.status === "FAILED" || job.status === "CANCELLED") {
            send(job.status === "SUCCEEDED" ? "job_completed" : "job_failed", { status: job.status });
            controller.close();
            closed = true;
          }
        } catch (err) {
          send("job_failed", { message: err instanceof Error ? err.message : "Unknown error" });
          controller.close();
          closed = true;
        }
      };

      await tick();
      const interval = setInterval(() => {
        void tick();
      }, POLL_INTERVAL_MS);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
