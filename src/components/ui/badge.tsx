const STATUS_CLASSES: Record<string, string> = {
  DRAFT: "bg-muted/20 text-muted",
  GENERATING: "bg-warning/15 text-warning",
  QUEUED: "bg-warning/15 text-warning",
  RUNNING: "bg-warning/15 text-warning",
  READY: "bg-success/15 text-success",
  SUCCEEDED: "bg-success/15 text-success",
  PUBLISHED: "bg-accent/15 text-accent",
  FAILED: "bg-danger/15 text-danger",
  CANCELLED: "bg-muted/20 text-muted",
  RETRYING: "bg-warning/15 text-warning",
};

export function StatusBadge({ status }: { status: string }) {
  const classes = STATUS_CLASSES[status] ?? "bg-muted/20 text-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ${classes}`}>
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}
