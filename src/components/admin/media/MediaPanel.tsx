"use client";

import MediaLibrary from "@/components/admin/media/MediaLibrary";
import PageHeader from "@/components/admin/PageHeader";

export default function MediaPanel() {
  return (
    <>
      <PageHeader
        title="Media library"
        lead="Every picture used on the website, in posts and in emails, in one place. They are stored in Shopify Files and served from its fast image network."
      />
      <MediaLibrary mode="manage" />
    </>
  );
}
