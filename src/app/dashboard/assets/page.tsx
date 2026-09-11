import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { Card, CardBody } from "@/components/ui/card";

export default async function AssetsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [images, voiceSegments] = await Promise.all([
    prisma.media.findMany({
      where: { project: { userId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { project: { select: { name: true } } },
    }),
    prisma.voiceSegment.count({ where: { project: { userId: user.id } } }),
  ]);

  const totalCost = images.reduce((sum, m) => sum + m.costUnits, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Assets</h1>
        <span className="text-sm text-muted">
          {images.length} images · {voiceSegments} voice clips
        </span>
      </div>

      {images.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">
            Generated images and audio from your projects will appear here.
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {images.map((m) => (
            <Card key={m.id} className="overflow-hidden">
              <div className="aspect-square bg-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.storageUrl} alt={m.prompt ?? "Generated image"} className="h-full w-full object-cover" />
              </div>
              <CardBody className="p-3">
                <p className="line-clamp-2 text-xs text-muted">{m.project.name}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">{totalCost} credits spent on shown images</p>
    </div>
  );
}
