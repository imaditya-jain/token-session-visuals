import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

import { authEnv } from "@/server/config/env";

const production = process.env["NODE_ENV"] === "production";

/** Shopify keeps unused carts for roughly ten days. */
export const CART_MAX_AGE_SECONDS = 10 * 24 * 60 * 60;
export const CART_COOKIE_NAME = production ? "__Secure-fw_cart" : "fw_cart";
export const CART_COOKIE_PATH = "/api/cart";
/** Non-sensitive flag so the browser only asks for a cart when one exists (anonymous visitors cost nothing). */
export const CART_HINT_COOKIE = "fw_cart_hint";

const mac = (cartId: string): string =>
  createHmac("sha256", authEnv().REFRESH_TOKEN_SECRET).update(`cart:${cartId}`).digest("base64url");

/** Signed cart token `base64url(cartId).hmac`: binds the cookie to one Shopify cart and rejects tampering. */
export const createCartToken = (cartId: string): string =>
  `${Buffer.from(cartId).toString("base64url")}.${mac(cartId)}`;

/** Returns the Shopify cart id when the token is authentic, otherwise null. */
export function readCartToken(token: string | undefined): string | null {
  if (!token || token.length > 600) return null;
  const [encoded, received, ...rest] = token.split(".");
  if (!encoded || !received || rest.length > 0) return null;
  const cartId = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = Buffer.from(mac(cartId));
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? cartId : null;
}

export const readCartCookie = (request: NextRequest): string | null =>
  readCartToken(request.cookies.get(CART_COOKIE_NAME)?.value);

export function setCartCookie(response: NextResponse, cartId: string): void {
  response.cookies.set({
    name: CART_COOKIE_NAME,
    value: createCartToken(cartId),
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: CART_COOKIE_PATH,
    maxAge: CART_MAX_AGE_SECONDS,
  });
  response.cookies.set({
    name: CART_HINT_COOKIE,
    value: "1",
    httpOnly: false,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: CART_MAX_AGE_SECONDS,
  });
}

export function clearCartCookie(response: NextResponse): void {
  response.cookies.set({ name: CART_COOKIE_NAME, value: "", path: CART_COOKIE_PATH, maxAge: 0 });
  response.cookies.set({ name: CART_HINT_COOKIE, value: "", path: "/", maxAge: 0 });
}
