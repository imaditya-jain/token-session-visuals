import { NextResponse } from "next/server";

import { assertBearerSecret } from "@/server/http/secret";
import { route } from "@/server/http/handler";
import { checkReadiness } from "@/server/services/health";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Readiness for uptime monitors and deploy checks. Reveals which dependencies are up, so it needs the same
 * bearer secret as the cron route and fails closed when none is configured.
 */
export const GET = route(async ({ request }) => {
  if (!assertBearerSecret(request, process.env["CRON_SECRET"]))
    return NextResponse.json(
      { error: { code: "not_configured", message: "Not configured" } },
      { status: 503 },
    );
  const readiness = await checkReadiness();
  return NextResponse.json(
    { data: readiness },
    { status: readiness.status === "ok" ? 200 : 503, headers: { "Retry-After": "10" } },
  );
});
