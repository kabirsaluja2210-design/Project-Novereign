import { Queue } from "bullmq";

const connection = {
  // BullMQ wants a plain connection config, not a shared ioredis instance
  // when used across the web + worker processes.
  host: new URL(process.env.REDIS_URL ?? "redis://localhost:6379").hostname,
  port: Number(new URL(process.env.REDIS_URL ?? "redis://localhost:6379").port || 6379),
};

export const GENERATION_QUEUE_NAME = "generation";

export const generationQueue = new Queue(GENERATION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 1, // retries are handled inside the pipeline at the stage level, not by re-running the whole job
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

export interface GenerationJobData {
  jobId: string; // our Job.id (Postgres), not the BullMQ job id
}

export async function enqueueGenerationJob(data: GenerationJobData) {
  await generationQueue.add("run_pipeline", data, { jobId: data.jobId });
}

export { connection as redisConnection };
