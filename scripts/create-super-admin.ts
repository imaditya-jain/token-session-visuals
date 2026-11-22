/**
 * Creates the FIRST Super Admin (like `createsuperuser`): there is no public admin sign-up, so one trusted
 * person is created out of band, then invites everyone else from the admin.
 *
 *   node --env-file=.env scripts/create-super-admin.ts --email you@example.com --first Ada --last Lovelace          # dry run
 *   node --env-file=.env scripts/create-super-admin.ts --email you@example.com --first Ada --last Lovelace --apply  # create
 *
 * No password is ever chosen here. The script prints a one-time link (valid 1 hour) to set the password; every
 * sign-in then also needs a code emailed to that address. It refuses to run when an active Super Admin already
 * exists (use the admin's invite flow instead) unless --allow-additional is given.
 */
import { createHmac, randomBytes } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { MongoClient } from "mongodb";

/** Must stay identical to `hashEmailToken` in src/server/auth/tokens.ts (a unit test enforces this). */
export const hashEmailTokenWith = (secret: string, token: string): string =>
  createHmac("sha256", secret).update(`email-token:${token}`).digest("hex");

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const allowAdditional = process.argv.includes("--allow-additional");
  const email = flag("email")?.trim().toLowerCase();
  const firstName = flag("first")?.trim();
  const lastName = flag("last")?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Missing or invalid --email");
  if (!firstName || !lastName) fail("Missing --first and/or --last");

  const uri = process.env["MONGODB_URI"] ?? fail("MONGODB_URI is not set");
  const secret = process.env["REFRESH_TOKEN_SECRET"];
  if (!secret || secret.length < 32) fail("REFRESH_TOKEN_SECRET is missing or too short");
  const siteUrl = process.env["SITE_URL"] ?? fail("SITE_URL is not set");
  const origin = new URL(siteUrl).origin;

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(process.env["MONGODB_DB_NAME"] ?? "fernwood");
    const users = db.collection("users");
    const tokens = db.collection("authtokens");

    const existingAdmins = await users.countDocuments({
      adminRole: "super_admin",
      disabledAt: { $exists: false },
    });
    if (existingAdmins > 0 && !allowAdditional) {
      fail(
        `An active Super Admin already exists (${existingAdmins}). Invite people from /admin/users, or pass --allow-additional.`,
      );
    }

    const existing = await users.findOne({ email });
    console.log(
      existing
        ? `Account ${email} exists and will be promoted (its password is replaced, sessions revoked).`
        : `Account ${email} will be created.`,
    );
    if (!apply) {
      console.log("Dry run. Re-run with --apply to make the change.");
      return;
    }

    const now = new Date();
    // Unusable random password: the owner sets a real one through the emailed/printed link.
    const passwordHash = await hash(randomBytes(32).toString("base64url"), {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      algorithm: 2,
    });
    const fields = {
      adminRole: "super_admin",
      role: "admin",
      passwordHash,
      sessions: [],
      failedLoginCount: 0,
      updatedAt: now,
    };
    let userId;
    if (existing) {
      await users.updateOne({ _id: existing._id }, { $set: fields, $unset: { disabledAt: 1 } });
      userId = existing._id;
    } else {
      const inserted = await users.insertOne({
        email,
        firstName,
        lastName,
        acceptsMarketing: false,
        createdAt: now,
        ...fields,
      });
      userId = inserted.insertedId;
    }

    const token = randomBytes(32).toString("base64url");
    await tokens.updateMany(
      { userId, type: "reset_password", usedAt: { $exists: false } },
      { $set: { usedAt: now } },
    );
    await tokens.insertOne({
      userId,
      type: "reset_password",
      tokenHash: hashEmailTokenWith(secret, token),
      expiresAt: new Date(now.getTime() + 3600_000),
      createdAt: now,
    });
    await db.collection("auditlogs").insertOne({
      action: "user.super_admin_bootstrapped",
      targetType: "user",
      targetId: String(userId),
      createdAt: now,
    });

    console.log("\nSuper Admin ready. Open this link within 1 hour to set the password:\n");
    console.log(`  ${origin}/reset-password?token=${encodeURIComponent(token)}\n`);
    console.log("Treat the link like a password. It works once.");
  } finally {
    await client.close();
  }
}

if (import.meta.main) await main();
