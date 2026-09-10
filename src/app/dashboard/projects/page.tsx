import Link from "next/link";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Link href="/dashboard/create">
          <Button>Create video</Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <p className="mb-4 text-sm text-muted">No projects yet.</p>
            <Link href="/dashboard/create">
              <Button>Create your first video</Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
              <Card className="h-full overflow-hidden transition hover:border-accent">
                <div className="aspect-video bg-bg">
                  {p.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt={p.name} className="h-full w-full object-cover" />
                  )}
                </div>
                <CardBody>
                  <div className="mb-2 flex items-center justify-between">
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-muted">{p.durationSec}s</span>
                  </div>
                  <h3 className="line-clamp-2 font-medium">{p.name}</h3>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
