import { prisma } from "@/server/db";
import { Card, CardBody } from "@/components/ui/card";

export default async function VoicesPage() {
  const voices = await prisma.voice.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Voices</h1>
      </div>
      <p className="mb-6 text-sm text-muted">
        {voices.every((v) => v.provider === "mock")
          ? "Showing the built-in placeholder voice catalog. Connect a real TTS provider (see PROVIDERS.md) to add production voices."
          : "Available voices from your connected providers."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {voices.map((v) => (
          <Card key={v.id}>
            <CardBody>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-medium">{v.name}</h3>
                <span className="text-xs text-muted">{v.provider}</span>
              </div>
              <p className="text-xs text-muted">
                {v.gender ?? "unspecified"} · {v.language}
                {v.accent ? ` (${v.accent})` : ""}
              </p>
              {v.styleTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {v.styleTags.map((tag) => (
                    <span key={tag} className="rounded-full bg-bg px-2 py-0.5 text-xs text-muted">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
