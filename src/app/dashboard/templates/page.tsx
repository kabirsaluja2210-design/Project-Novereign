import Link from "next/link";
import { prisma } from "@/server/db";
import { Card, CardBody } from "@/components/ui/card";

export default async function TemplatesPage() {
  const templates = await prisma.template.findMany({
    where: { isPublic: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Templates</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Link key={t.id} href={`/dashboard/create?template=${t.id}`}>
            <Card className="h-full transition hover:border-accent">
              <CardBody>
                <span className="text-xs font-medium uppercase text-muted">{t.category}</span>
                <h3 className="mt-1 font-medium">{t.name}</h3>
                <p className="mt-1 text-sm text-muted">{t.description}</p>
                <div className="mt-3 text-xs text-muted">
                  {t.sceneCount} scenes · {t.defaultDurationSec}s
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
