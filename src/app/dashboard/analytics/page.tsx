import { RoadmapNotice } from "@/components/dashboard/roadmap-notice";

export default function AnalyticsPage() {
  return (
    <RoadmapNotice
      title="No platform analytics yet"
      body="Real view/engagement analytics require a connected, published post on each platform (see Publishing) so we can pull real numbers from that platform's API - we won't fabricate view counts."
      requires={["social publishing integrations", "analytics API polling"]}
    />
  );
}
