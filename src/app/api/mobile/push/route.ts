import { NextResponse } from "next/server";

import { forbidden } from "@/server/http/errors";
import { isNativeClient, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import {
  registerDevice,
  registerDeviceSchema,
  unregisterDevice,
  unregisterDeviceSchema,
} from "@/server/services/push";

export const dynamic = "force-dynamic";

/** Registers this phone for order-update pushes. Idempotent. */
export const POST = route(async ({ request }) => {
  if (!isNativeClient(request)) throw forbidden("Not available", "native_client_required");
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`push:${userId}`, 30, 3600);
  await registerDevice(userId, await readJson(request, registerDeviceSchema));
  return new NextResponse(null, { status: 204 });
});

/** Stops pushes to this phone (called on sign-out). */
export const DELETE = route(async ({ request }) => {
  if (!isNativeClient(request)) throw forbidden("Not available", "native_client_required");
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`push:${userId}`, 30, 3600);
  const { token } = await readJson(request, unregisterDeviceSchema);
  await unregisterDevice(userId, token);
  return new NextResponse(null, { status: 204 });
});
