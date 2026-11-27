import "server-only";

import type { NextRequest } from "next/server";

/** The n-th path segment after `/api/` (0 = first). Route params are validated again by the service. */
export const apiSegment = (request: NextRequest, index: number): string =>
  request.nextUrl.pathname.split("/").filter(Boolean)[index + 1] ?? "";
