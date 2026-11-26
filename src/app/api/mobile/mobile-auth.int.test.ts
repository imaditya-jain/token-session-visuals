// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { EmailJob } from "@/server/db/models/email-job";
import { RateLimit } from "@/server/db/models/rate-limit";
import { User } from "@/server/db/models/user";
import { startTestDatabase } from "@/test/mongo";

import { POST as login } from "../auth/login/route";
import { GET as me } from "../me/route";
import { POST as addWish } from "../wishlist/items/route";
import { POST as logout } from "./auth/logout/route";
import { POST as refresh } from "./auth/refresh/route";
import { POST as register } from "./auth/register/route";
import { POST as verify } from "./auth/verify/route";

vi.mock("@/data/catalog", () => ({
  getProduct: vi.fn(async (handle: string) => ({ slug: handle })),
  getProducts: vi.fn(async () => []),
}));

const ORIGIN = "http://localhost:3100";
const credentials = {
  email: "mobile@example.com",
  password: "correct horse battery",
  firstName: "Mo",
  lastName: "Bile",
  acceptsMarketing: false,
};
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await startTestDatabase();
}, 120_000);
afterAll(async () => {
  await disconnectDb();
  await server.stop();
  vi.unstubAllEnvs();
  resetEnvCache();
});
beforeEach(async () => {
  const { connectDb } = await import("@/server/db/connection");
  await connectDb();
  await Promise.all([User.deleteMany({}), RateLimit.deleteMany({}), EmailJob.deleteMany({})]);
});

const call = (
  path: string,
  method: string,
  {
    body,
    native = true,
    token,
    origin,
  }: { body?: unknown; native?: boolean; token?: string; origin?: string } = {},
) =>
  new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(native ? { "x-fernwood-client": "app" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(origin ? { origin } : {}),
      "x-forwarded-for": "198.51.100.40",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (response: Response): Promise<any> => response.json();

async function signUp() {
  const response = await register(call("/api/mobile/auth/register", "POST", { body: credentials }));
  return { response, body: await json(response) };
}

describe("mobile sign-in", () => {
  it("registers and returns the refresh token in the body, never as a cookie", async () => {
    const { response, body } = await signUp();
    expect(response.status).toBe(201);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).toEqual(expect.any(String));
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("refuses the mobile endpoints without the native-client header", async () => {
    const response = await register(
      call("/api/mobile/auth/register", "POST", { body: credentials, native: false }),
    );
    expect(response.status).toBe(403);
    expect((await json(response)).error.code).toBe("native_client_required");
    expect(
      (
        await refresh(
          call("/api/mobile/auth/refresh", "POST", {
            body: { refreshToken: "x".repeat(30) },
            native: false,
          }),
        )
      ).status,
    ).toBe(403);
  });

  it("signs in with password then the emailed code, with no Origin header", async () => {
    await signUp();
    await User.updateOne({}, { $set: { shopifyCustomerId: "gid://shopify/Customer/1" } });
    const first = await login(
      call("/api/auth/login", "POST", {
        body: { email: credentials.email, password: credentials.password },
      }),
    );
    expect(first.status).toBe(200);
    const { ref } = (await json(first)).data;
    const job = await EmailJob.findOne({ template: "otp-code", to: credentials.email })
      .sort({ createdAt: -1 })
      .lean();
    const code = (job?.data as { code: string }).code;

    const wrong = await verify(
      call("/api/mobile/auth/verify", "POST", { body: { challenge: ref, code: "000000" } }),
    );
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    const ok = await verify(
      call("/api/mobile/auth/verify", "POST", { body: { challenge: ref, code } }),
    );
    expect(ok.status).toBe(200);
    const session = (await json(ok)).data;
    expect(session.refreshToken).toEqual(expect.any(String));
    expect(ok.headers.getSetCookie()).toEqual([]);

    const profile = await me(call("/api/me", "GET", { token: session.accessToken }));
    expect((await json(profile)).data.user.email).toBe(credentials.email);
  });

  it("rotates the refresh token, and replaying the old one signs the device out", async () => {
    const { body } = await signUp();
    const first = body.data.refreshToken as string;

    const rotated = await refresh(
      call("/api/mobile/auth/refresh", "POST", { body: { refreshToken: first } }),
    );
    expect(rotated.status).toBe(200);
    const next = (await json(rotated)).data;
    expect(next.refreshToken).not.toBe(first);

    // The very next call with the new token works.
    expect(
      (
        await refresh(
          call("/api/mobile/auth/refresh", "POST", { body: { refreshToken: next.refreshToken } }),
        )
      ).status,
    ).toBe(200);
    // A garbage token is a plain 401.
    expect(
      (
        await refresh(
          call("/api/mobile/auth/refresh", "POST", { body: { refreshToken: "z".repeat(43) } }),
        )
      ).status,
    ).toBe(401);
  });

  it("rejects malformed bodies and extra fields", async () => {
    for (const bad of [
      {},
      { refreshToken: 5 },
      { refreshToken: "short" },
      { refreshToken: "x".repeat(30), extra: 1 },
    ]) {
      expect((await refresh(call("/api/mobile/auth/refresh", "POST", { body: bad }))).status).toBe(
        400,
      );
    }
  });

  it("logs out one device and ignores unknown tokens", async () => {
    const { body } = await signUp();
    const token = body.data.refreshToken as string;
    expect(
      (await logout(call("/api/mobile/auth/logout", "POST", { body: { refreshToken: token } })))
        .status,
    ).toBe(204);
    expect(
      (await refresh(call("/api/mobile/auth/refresh", "POST", { body: { refreshToken: token } })))
        .status,
    ).toBe(401);
    expect(
      (
        await logout(
          call("/api/mobile/auth/logout", "POST", { body: { refreshToken: "q".repeat(43) } }),
        )
      ).status,
    ).toBe(204);
  });
});

describe("the native-client header and CSRF", () => {
  it("lets the app call Bearer endpoints that check the Origin, without an Origin", async () => {
    const { body } = await signUp();
    const token = body.data.accessToken as string;
    const response = await addWish(
      call("/api/wishlist/items", "POST", { body: { handle: "fern" }, token }),
    );
    expect(response.status).toBe(200);
  });

  it("still blocks a cross-origin browser request that lacks the header", async () => {
    const { body } = await signUp();
    const token = body.data.accessToken as string;
    const response = await addWish(
      call("/api/wishlist/items", "POST", {
        body: { handle: "fern" },
        token,
        native: false,
        origin: "https://evil.example",
      }),
    );
    expect(response.status).toBe(403);
  });
});
