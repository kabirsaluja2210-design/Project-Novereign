"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { STAGE_LABELS, PIPELINE_STAGES, type PipelineStage } from "@/server/queue/stages";

interface StepState {
  stage: string;
  status: string;
  lastError?: string | null;
}

const ICONS: Record<string, string> = {
  QUEUED: "○",
  RUNNING: "◐",
  SUCCEEDED: "✓",
  FAILED: "✕",
  CANCELLED: "–",
  RETRYING: "◐",
};

export function PipelineProgress({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [steps, setSteps] = useState<StepState[]>(
    PIPELINE_STAGES.map((stage) => ({ stage, status: "QUEUED" })),
  );
  const [jobStatus, setJobStatus] = useState("QUEUED");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/jobs/${jobId}/stream`);

    source.addEventListener("stage_progress", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setSteps(data.steps);
      setJobStatus(data.status);
    });

    const finish = () => {
      setDone(true);
      source.close();
      router.refresh();
    };

    source.addEventListener("job_completed", finish);
    source.addEventListener("job_failed", finish);
    source.onerror = () => {
      // EventSource retries automatically; nothing to do here.
    };

    return () => source.close();
  }, [jobId, router]);

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.stage} className="flex items-center gap-3">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
              step.status === "SUCCEEDED"
                ? "bg-success/15 text-success"
                : step.status === "FAILED"
                  ? "bg-danger/15 text-danger"
                  : step.status === "RUNNING"
                    ? "animate-pulse bg-warning/15 text-warning"
                    : "bg-muted/15 text-muted"
            }`}
          >
            {ICONS[step.status] ?? "○"}
          </span>
          <div>
            <div className="text-sm font-medium">{STAGE_LABELS[step.stage as PipelineStage] ?? step.stage}</div>
            {step.status === "FAILED" && step.lastError && (
              <div className="text-xs text-danger">{step.lastError}</div>
            )}
          </div>
        </div>
      ))}
      {!done && jobStatus !== "FAILED" && (
        <p className="pt-2 text-xs text-muted">
          You can leave this page — generation continues in the background.
        </p>
      )}
    </div>
  );
}
