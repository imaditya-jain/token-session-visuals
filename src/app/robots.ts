import type { MetadataRoute } from "next";

import { publicOrigin } from "@/server/config/site";

/** Everything public is crawlable; account, auth, token and API URLs are not (they are also `noindex`). */
export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/monitoring",
          "/account",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
          "/unsubscribe",
          "/newsletter/",
          "/search",
          "/listing/",
          "/order-confirmed",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
