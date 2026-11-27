import type { Metadata } from "next";

import ContentShell from "@/components/content/ContentShell";
import ReelsFeed from "@/components/reels/ReelsFeed";

export const metadata: Metadata = {
  title: "Reels",
  description: "Real gardens, balconies and landscaping from the Fernwood community.",
};

export default function Page() {
  return (
    <ContentShell
      eyebrow="Community"
      title="Reels"
      intro="Real gardens, balconies and landscaping from our community. Reels last 24 hours; photo posts stay."
    >
      <ReelsFeed />
    </ContentShell>
  );
}
