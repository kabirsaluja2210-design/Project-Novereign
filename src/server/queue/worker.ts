import "dotenv/config";
import { Worker, type Job as BullJob } from "bullmq";
import { GENERATION_QUEUE_NAME, redisConnection, type GenerationJobData } from "./queue";
import { runPipeline } from "./pipeline";

/**
 * Standalone worker process entrypoint (`npm run worker`). Never run the
 * generation pipeline inside a Next.js API route (directive §120/§121) - the
 * web process only ever enqueues work here and reads progress back from
 * Postgres via SSE.
 */
const worker = new Worker<GenerationJobData>(
  GENERATION_QUEUE_NAME,
  async (job: BullJob<GenerationJobData>) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] starting pipeline for job ${job.data.jobId}`);
    await runPipeline(job.data.jobId);
    // eslint-disable-next-line no-console
    console.log(`[worker] finished pipeline for job ${job.data.jobId}`);
  },
  {
    connection: redisConnection,
    concurrency: 4,
  },
);

worker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error(`[worker] job ${job?.data.jobId} failed:`, err.message);
});

worker.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[worker] error:", err);
});

// eslint-disable-next-line no-console
console.log(`[worker] listening on queue "${GENERATION_QUEUE_NAME}"`);
