import { NextResponse } from "next/server";

import { analyticsQuerySchema } from "@/lib/analytics";
import type { Permission } from "@/lib/permissions";
import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { buildAnalytics } from "@/server/services/analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Headline numbers for the dashboard. Each part is checked against the caller's own permissions, and a part that
 * can't be read is reported as unavailable instead of as zero.
 */
export const GET = route(async ({ request }) => {
  const admin = await requireAdmin(request, "dashboard:view");
  await enforceRateLimit(`admin:analytics:${admin.userId}`, 120, 3600);
  const { from, to } = analyticsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const has = (p: Permission) => admin.permissions.has(p);
  return NextResponse.json({
    data: await buildAnalytics(from, to, {
      sales: has("analytics:view"),
      orders: has("orders:read"),
      inventory: has("inventory:read"),
      enquiries: has("enquiries:read"),
      subscriptions: has("subscriptions:read"),
    }),
  });
});
