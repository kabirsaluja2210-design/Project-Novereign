import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { Card, CardBody } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { PipelineProgress } from "@/components/dashboard/pipeline-progress";
import { RetryButton } from "@/components/dashboard/retry-button";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: {
      scenes: { orderBy: { index: "asc" }, include: { media: true, voiceSegment: true } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!project) notFound();

  const activeJob = project.jobs[0];
  const isActive = activeJob && (activeJob.status === "QUEUED" || activeJob.status === "RUNNING");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted">{project.idea}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {isActive && activeJob && (
        <Card>
          <CardBody>
            <h2 className="mb-4 font-semibold">Generating your video</h2>
            <PipelineProgress jobId={activeJob.id} />
          </CardBody>
        </Card>
      )}

      {project.status === "FAILED" && (
        <Card>
          <CardBody>
            <h2 className="mb-2 font-semibold text-danger">Generation failed</h2>
            <p className="mb-4 text-sm text-muted">{project.errorMessage}</p>
            <RetryButton projectId={project.id} />
          </CardBody>
        </Card>
      )}

      {project.status === "READY" && project.finalVideoUrl && (
        <Card>
          <CardBody>
            <div className="mx-auto max-w-sm">
              <video
                src={project.finalVideoUrl}
                poster={project.thumbnailUrl ?? undefined}
                controls
                className="w-full rounded-lg bg-black"
              />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted">
                {project.creditActual ?? project.creditEstimate} credits used
              </span>
              <a
                href={project.finalVideoUrl}
                download
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
              >
                Download MP4
              </a>
            </div>
          </CardBody>
        </Card>
      )}

      {project.scenes.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold">Scenes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {project.scenes.map((scene) => (
              <Card key={scene.id} className="overflow-hidden">
                <div className="aspect-video bg-bg">
                  {scene.media?.storageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scene.media.storageUrl}
                      alt={`Scene ${scene.index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <CardBody>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">Scene {scene.index + 1}</span>
                    <StatusBadge status={scene.status} />
                  </div>
                  <p className="line-clamp-3 text-sm">{scene.scriptText}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
