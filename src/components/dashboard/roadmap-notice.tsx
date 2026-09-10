import { Card, CardBody } from "@/components/ui/card";

/**
 * Honest "not built yet" notice (directive §106/§211: never fake a feature as
 * complete). Used for areas whose data model exists (see ARCHITECTURE.md)
 * but that have no working UI/integration in this build.
 */
export function RoadmapNotice({ title, body, requires }: { title: string; body: string; requires?: string[] }) {
  return (
    <Card>
      <CardBody className="py-10 text-center">
        <h2 className="mb-2 font-semibold">{title}</h2>
        <p className="mx-auto max-w-md text-sm text-muted">{body}</p>
        {requires && requires.length > 0 && (
          <p className="mx-auto mt-3 max-w-md text-xs text-muted">
            Needs: {requires.join(", ")}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
