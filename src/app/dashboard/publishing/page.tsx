import { RoadmapNotice } from "@/components/dashboard/roadmap-notice";

export default function PublishingPage() {
  return (
    <RoadmapNotice
      title="Social publishing isn't connected yet"
      body="Publishing directly to YouTube, TikTok, Instagram, Facebook, or X requires OAuth apps registered with each platform and per-platform upload adapters. The data model (SocialAccount, PublishedPost) is ready for this."
      requires={["YouTube/Meta/TikTok/X developer app credentials", "OAuth connect flow", "upload adapters"]}
    />
  );
}
