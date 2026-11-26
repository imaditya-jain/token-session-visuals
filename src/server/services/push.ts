import "server-only";

import { Types } from "mongoose";
import { z } from "zod";

import { connectDb } from "@/server/db/connection";
import { MAX_DEVICES_PER_USER, PushDevice } from "@/server/db/models/push-device";
import { logger } from "@/server/logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

/** `ExponentPushToken[...]` or `ExpoPushToken[...]`. Anything else is refused before it is stored or used. */
export const PUSH_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/;

export const registerDeviceSchema = z
  .object({ token: z.string().regex(PUSH_TOKEN_PATTERN), platform: z.enum(["ios", "android"]) })
  .strict();
export const unregisterDeviceSchema = z
  .object({ token: z.string().regex(PUSH_TOKEN_PATTERN) })
  .strict();

/**
 * Remembers this phone for the signed-in customer. A token belongs to one account at a time: if the phone changed
 * hands, the new sign-in takes it over. Each account keeps its newest MAX_DEVICES_PER_USER phones.
 */
export async function registerDevice(
  userId: string,
  input: z.infer<typeof registerDeviceSchema>,
): Promise<void> {
  await connectDb();
  const owner = new Types.ObjectId(userId);
  const now = new Date();
  await PushDevice.updateOne(
    { token: input.token },
    {
      $set: { userId: owner, platform: input.platform, lastSeenAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  const extra = await PushDevice.find({ userId: owner })
    .sort({ lastSeenAt: -1 })
    .skip(MAX_DEVICES_PER_USER)
    .select("_id")
    .lean();
  if (extra.length > 0) await PushDevice.deleteMany({ _id: { $in: extra.map((d) => d._id) } });
}

/** Stops sending to this phone for this account (sign-out). Another account's token is never touched. */
export async function unregisterDevice(userId: string, token: string): Promise<void> {
  await connectDb();
  await PushDevice.deleteOne({ userId: new Types.ObjectId(userId), token });
}

const ticketSchema = z.object({
  data: z.array(
    z.object({
      status: z.string(),
      details: z.object({ error: z.string().optional() }).optional(),
    }),
  ),
});

export type PushMessage = { title: string; body: string; data?: Record<string, string> };

/**
 * Sends a push to every phone of one customer through Expo's push service. Never throws (a failed push must not
 * fail the order sync that triggered it) and never logs tokens. Phones Expo reports as gone are forgotten.
 */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<void> {
  try {
    await connectDb();
    const devices = await PushDevice.find({ userId: new Types.ObjectId(userId) }).lean();
    if (devices.length === 0) return;
    const accessToken = process.env["EXPO_ACCESS_TOKEN"];

    for (let start = 0; start < devices.length; start += BATCH) {
      const batch = devices.slice(start, start + BATCH);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((device) => ({
            to: device.token,
            title: message.title,
            body: message.body,
            sound: "default",
            channelId: "orders",
            ...(message.data ? { data: message.data } : {}),
          })),
        ),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        logger.warn({ status: response.status }, "Expo push service refused a batch");
        continue;
      }
      const tickets = ticketSchema.parse(await response.json()).data;
      const gone = batch.filter(
        (_, index) => tickets[index]?.details?.error === "DeviceNotRegistered",
      );
      if (gone.length > 0) await PushDevice.deleteMany({ _id: { $in: gone.map((d) => d._id) } });
    }
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Push notification failed",
    );
  }
}
