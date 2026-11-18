import "server-only";

import type { NextRequest, NextResponse } from "next/server";

const production = process.env["NODE_ENV"] === "production";

/** `__Secure-` requires HTTPS, so it is used in production only. Path scoping keeps it off non-auth requests. */
export const REFRESH_COOKIE_NAME = production ? "__Secure-fw_rt" : "fw_rt";
export const REFRESH_COOKIE_PATH = "/api/auth";

/**
 * Non-sensitive presence flag readable by the browser (value is always "1", never a token). It lets the
 * client skip the session-restore call for anonymous visitors, which is almost all traffic.
 */
export const AUTH_HINT_COOKIE = "fw_auth";

export function setRefreshCookie(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number,
): void {
  response.cookies.set({
    name: AUTH_HINT_COOKIE,
    value: "1",
    httpOnly: false,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  response.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  });
}

export function clearRefreshCookie(response: NextResponse): void {
  response.cookies.set({
    name: AUTH_HINT_COOKIE,
    value: "",
    httpOnly: false,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
}

export const readRefreshCookie = (request: NextRequest): string | undefined =>
  request.cookies.get(REFRESH_COOKIE_NAME)?.value || undefined;
