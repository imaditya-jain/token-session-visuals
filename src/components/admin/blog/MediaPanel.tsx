"use client";

import MediaLibrary from "@/components/admin/blog/MediaLibrary";
import PageHeader from "@/components/admin/PageHeader";

export default function MediaPanel() {
  return (
    <>
      <PageHeader
        title="Media"
        lead="Images for your posts. They are stored in Shopify Files and served from its fast image network."
      />
      <MediaLibrary mode="manage" />
    </>
  );
}
