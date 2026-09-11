import Link from "next/link";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

export default async function DashboardHomePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [plan, recentProjects, projectCount, activeJobs] = await Promise.all([
    user.planId ? prisma.plan.findUnique({ where: { id: user.planId } }) : null,
    prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.project.count({ where: { userId: user.id } }),
    prisma.job.count({ where: { userId: user.id, status: { in: ["QUEUED", "RUNNING"] } } }),
  ]);

  return (
    <div className="space-y-8">
      <section className="flex flex-col items-start justify-between gap-4 rounded-card border border-border bg-surface p-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold">Welcome back{user.name ? `, ${user.name}` : ""}</h1>
          <p className="mt-1 text-sm text-muted">
            {plan?.name ?? "Free"} plan · {user.creditBalance.toLocaleString()} credits available
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/create">
            <Button size="lg">Create a video</Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-sm text-muted">Videos created</div>
            <div className="mt-1 text-2xl font-semibold">{projectCount}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-muted">Active generations</div>
            <div className="mt-1 text-2xl font-semibold">{activeJobs}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-muted">Credit balance</div>
            <div className="mt-1 text-2xl font-semibold">{user.creditBalance.toLocaleString()}</div>
          </CardBody>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent projects</h2>
          <Link href="/dashboard/projects" className="text-sm font-medium text-accent">
            View all
          </Link>
        </div>
        {recentProjects.length === 0 ? (
          <Card>
            <CardBody className="text-center py-10">
              <p className="mb-4 text-sm text-muted">No projects yet.</p>
              <Link href="/dashboard/create">
                <Button>Create your first video</Button>
              </Link>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentProjects.map((p) => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                <Card className="h-full transition hover:border-accent">
                  <CardBody>
                    <div className="mb-2 flex items-center justify-between">
                      <StatusBadge status={p.status} />
                    </div>
                    <h3 className="font-medium">{p.name}</h3>
                    <p className="mt-1 text-xs text-muted">{p.durationSec}s · {p.aspectRatio.replace("RATIO_", "").replace("_", ":")}</p>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
