import { createFileRoute } from "@tanstack/react-router";

import HomePage from "@/components/storefront/HomePage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fernwood — Premium Plants & Garden Essentials" },
      {
        name: "description",
        content:
          "Shop lush house plants, succulents, handmade pots and garden tools at Fernwood — a premium botanical store for greener living.",
      },
      { property: "og:title", content: "Fernwood — Premium Plants & Garden Essentials" },
      {
        property: "og:description",
        content:
          "Bring color and life to your home. House plants, succulents, pots and tools from Fernwood's nursery to your door.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Fernwood — Premium Plants & Garden Essentials" },
      {
        name: "twitter:description",
        content: "Bring color and life to your home with Fernwood's premium plants and pots.",
      },
    ],
  }),
  component: HomePage,
});
