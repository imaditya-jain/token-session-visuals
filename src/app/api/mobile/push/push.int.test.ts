// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { PushDevice } from "@/server/db/models/push-device";
import { RateLimit } from "@/server/db/models/rate-limit";
import { User } from "@/server/db/models/user";
import { registerUser } from "@/server/services/auth";
import { sendPushToUser } from "@/server/services/push";
import { startTestDatabase } from "@/test/mongo";

import { DELETE, POST } from "./route";

const ORIGIN = "http://localhost:3100";
const TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";
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
  await Promise.all([User.deleteMany({}), PushDevice.deleteMany({}), RateLimit.deleteMany({})]);
});
afterEach(() => vi.restoreAllMocks());

const meta = { ip: "198.51.100.61", userAgent: "vitest" };
async function signUp(email: string) {
  const { accessToken, user } = await registerUser(
    {
      email,
      password: "correct horse battery",
      firstName: "P",
      lastName: "N",
      acceptsMarketing: false,
    },
    meta,
  );
  return { token: accessToken, id: user.id };
}

const call = (method: "POST" | "DELETE", token: string | null, body: unknown, native = true) =>
  new NextRequest(`${ORIGIN}/api/mobile/push`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(native ? { "x-fernwood-client": "app" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

describe("push device registration", () => {
  it("needs a session and the native-client header", async () => {
    expect((await POST(call("POST", null, { token: TOKEN_A, platform: "android" }))).status).toBe(
      401,
    );
    const { token } = await signUp("p1@example.com");
    expect(
      (await POST(call("POST", token, { token: TOKEN_A, platform: "android" }, false))).status,
    ).toBe(403);
  });

  it("registers idempotently, validates the token and platform, and unregisters", async () => {
    const { token, id } = await signUp("p2@example.com");
    for (let i = 0; i < 2; i++) {
      expect(
        (await POST(call("POST", token, { token: TOKEN_A, platform: "android" }))).status,
      ).toBe(204);
    }
    expect(await PushDevice.countDocuments({ userId: id })).toBe(1);
    for (const bad of [
      { token: "nope", platform: "ios" },
      { token: TOKEN_A, platform: "web" },
      { token: TOKEN_A, platform: "ios", extra: 1 },
      {},
    ]) {
      expect((await POST(call("POST", token, bad))).status).toBe(400);
    }
    expect((await DELETE(call("DELETE", token, { token: TOKEN_A }))).status).toBe(204);
    expect(await PushDevice.countDocuments({})).toBe(0);
  });

  it("moves a phone to the account that signs in on it, and one account cannot remove another's phone", async () => {
    const ada = await signUp("ada-push@example.com");
    const bob = await signUp("bob-push@example.com");
    await POST(call("POST", ada.token, { token: TOKEN_A, platform: "ios" }));
    await DELETE(call("DELETE", bob.token, { token: TOKEN_A }));
    expect(await PushDevice.countDocuments({ userId: ada.id })).toBe(1);
    await POST(call("POST", bob.token, { token: TOKEN_A, platform: "ios" }));
    expect(await PushDevice.countDocuments({ userId: ada.id })).toBe(0);
    expect(await PushDevice.countDocuments({ userId: bob.id })).toBe(1);
  });
});

describe("sending", () => {
  it("posts one message per phone to Expo and forgets phones Expo says are gone", async () => {
    const { token, id } = await signUp("p3@example.com");
    await POST(call("POST", token, { token: TOKEN_A, platform: "android" }));
    await POST(call("POST", token, { token: TOKEN_B, platform: "ios" }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "ok", id: "1" },
            { status: "error", details: { error: "DeviceNotRegistered" } },
          ],
        }),
        { status: 200 },
      ),
    );
    await sendPushToUser(id, {
      title: "Order #1 is on its way",
      body: "Shipped",
      data: { link: "/account/orders/1" },
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    const sent = JSON.parse(String(init.body)) as { to: string; title: string }[];
    expect(sent).toHaveLength(2);
    expect(sent.every((m) => m.title === "Order #1 is on its way")).toBe(true);
    expect(await PushDevice.countDocuments({ userId: id })).toBe(1);
  });

  it("never throws when Expo is down, and does nothing for a customer with no phone", async () => {
    const { token, id } = await signUp("p4@example.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(sendPushToUser(id, { title: "t", body: "b" })).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    await POST(call("POST", token, { token: TOKEN_A, platform: "android" }));
    await expect(sendPushToUser(id, { title: "t", body: "b" })).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
