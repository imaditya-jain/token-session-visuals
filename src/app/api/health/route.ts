import { NextResponse } from "next/server";

import { route } from "@/server/http/handler";

export const dynamic = "force-dynamic";

/**
 * Liveness: the process is up and serving. Deliberately touches no dependency (database, Shopify) so a downstream
 * outage never makes the platform restart a healthy instance. Exposes nothing about the system.
 */
export const GET = route(async () => NextResponse.json({ data: { status: "ok" } }));
