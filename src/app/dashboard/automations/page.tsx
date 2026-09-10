import { RoadmapNotice } from "@/components/dashboard/roadmap-notice";

export default function AutomationsPage() {
  return (
    <RoadmapNotice
      title="Automation isn't wired up yet"
      body="Turning a topic pool into a scheduled, recurring publishing pipeline needs a cron scheduler and safety limits (max videos/credits per day) on top of the generation pipeline this build already has."
      requires={["cron scheduler worker", "topic pool UI", "per-automation credit caps"]}
    />
  );
}
