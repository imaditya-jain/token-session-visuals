/**
 * Demo content for the Reels feature (development only).
 *
 *   FFMPEG_PATH=/path/to/ffmpeg node --env-file=.env scripts/seed-reels.ts           # dry run (default)
 *   FFMPEG_PATH=/path/to/ffmpeg node --env-file=.env scripts/seed-reels.ts --apply   # create the demo content
 *   node --env-file=.env scripts/seed-reels.ts --remove                              # delete exactly what this made
 *
 * Creates three demo authors (emails @demo.fernwood.invalid, no usable password), photo posts built from the
 * shop's own product pictures and short video reels made from them, uploads the files to the Supabase bucket
 * under the authors' public handles, and records them as approved. Demo reels expire after 7 days like any
 * reel, so re-run --apply to refresh. Nothing real is touched: --remove deletes only demo authors and their content.
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MongoClient, ObjectId } from "mongodb";

const apply = process.argv.includes("--apply");
const remove = process.argv.includes("--remove");
const DEMO_DOMAIN = "demo.fernwood.invalid";
const need = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const supabase = need("SUPABASE_URL").replace(/\/+$/, "") + "/storage/v1";
const key = need("SUPABASE_SERVICE_ROLE_KEY");
const bucket = process.env["SUPABASE_REELS_BUCKET"]?.trim() || "reels";
const shopHost = need("SHOPIFY_STORE_URL")
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "");

const AUTHORS = [
  { firstName: "Meera", lastName: "Kulkarni" },
  { firstName: "Arjun", lastName: "Deshmukh" },
  { firstName: "Riya", lastName: "Patil" },
];

const POSTS = [
  { caption: "Morning light on the balcony jungle.", topic: "home-planting" },
  { caption: "Little corner, big green energy.", topic: "home-planting" },
  { caption: "Weekend garden refresh: new pots, new life.", topic: "gardening" },
  { caption: "Layering textures for a small courtyard.", topic: "landscaping" },
  { caption: "My shelf is officially full. Zero regrets.", topic: "home-planting" },
  { caption: "Watering day rituals.", topic: "gardening" },
] as const;

/** Shapes cycled through the demo posts so the feed shows every supported ratio. */
const SHAPES = ["original", "square", "wide", "original", "square", "tall"] as const;

const REELS = [
  { caption: "Slow walk through the plant corner.", topic: "home-planting", seconds: 8 },
  { caption: "Garden bed makeover in 8 seconds.", topic: "gardening", seconds: 8 },
  { caption: "Courtyard greens, golden hour.", topic: "landscaping", seconds: 8 },
] as const;

type Product = { handle: string; title: string; image: string };

async function shopProducts(): Promise<Product[]> {
  const response = await fetch(`https://${shopHost}/api/2025-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": need("SHOPIFY_STOREFRONT_API_ACCESS_TOKEN"),
    },
    body: JSON.stringify({
      query: `{ products(first: 20, sortKey: BEST_SELLING) { nodes { handle title availableForSale featuredImage { url } } } }`,
    }),
  });
  const body = (await response.json()) as {
    data?: {
      products: {
        nodes: {
          handle: string;
          title: string;
          availableForSale: boolean;
          featuredImage: { url: string } | null;
        }[];
      };
    };
  };
  return (body.data?.products.nodes ?? [])
    .filter((p) => p.availableForSale && p.featuredImage)
    .map((p) => ({ handle: p.handle, title: p.title, image: p.featuredImage?.url ?? "" }));
}

async function upload(path: string, file: Buffer, contentType: string): Promise<void> {
  const sign = await fetch(`${supabase}/object/upload/sign/${bucket}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: "{}",
  });
  const signed = (await sign.json()) as { token?: string; url?: string };
  const token = signed.token ?? new URL(signed.url ?? "", "https://x").searchParams.get("token");
  if (!sign.ok || !token) throw new Error(`Could not sign an upload (${sign.status})`);
  const put = await fetch(
    `${supabase}/object/upload/sign/${bucket}/${path}?token=${encodeURIComponent(token)}`,
    {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(file),
    },
  );
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
}

async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await fetch(`${supabase}/object/${bucket}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
}

function dimensions(ffmpeg: string, file: string): { width: number; height: number } {
  let text = "";
  try {
    execFileSync(ffmpeg, ["-i", file], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  } catch (error) {
    text = String((error as { stderr?: unknown }).stderr ?? "");
  }
  const match = /, (\d{2,5})x(\d{2,5})/.exec(text);
  return { width: Number(match?.[1] ?? 1080), height: Number(match?.[2] ?? 1350) };
}

/** Crops a picture to one of the supported shapes and returns the new file and its width / height. */
function shaped(
  ffmpeg: string,
  file: string,
  shape: (typeof SHAPES)[number],
  out: string,
): { file: string; ratio: number } {
  const { width, height } = dimensions(ffmpeg, file);
  if (shape === "original") return { file, ratio: width / height };
  const crop =
    shape === "square"
      ? "crop='min(iw,ih)':'min(iw,ih)'"
      : shape === "wide"
        ? "crop=iw:'min(ih,iw*9/16)'"
        : "crop='min(iw,ih*7/11)':'min(ih,iw*11/7)'";
  execFileSync(ffmpeg, ["-y", "-i", file, "-vf", crop, "-q:v", "3", out], { stdio: "ignore" });
  const made = dimensions(ffmpeg, out);
  return { file: out, ratio: made.width / made.height };
}

const mongo = new MongoClient(need("MONGODB_URI"));
await mongo.connect();
const db = mongo.db(process.env["MONGODB_DB_NAME"] ?? "fernwood");
const users = db.collection("users");
const profiles = db.collection("reelprofiles");
const reels = db.collection("reels");

try {
  const existing = await users
    .find({ email: { $regex: `@${DEMO_DOMAIN.replace(/\./g, "\\.")}$` } })
    .toArray();
  const ids = existing.map((u) => u._id);

  if (remove) {
    const mine = await reels.find({ userId: { $in: ids } }).toArray();
    console.log(`Removing ${mine.length} demo reels and ${existing.length} demo authors.`);
    await removeFiles(mine.map((r) => r["storagePath"] as string));
    await reels.deleteMany({ userId: { $in: ids } });
    await profiles.deleteMany({ userId: { $in: ids } });
    await users.deleteMany({ _id: { $in: ids } });
  } else {
    const products = await shopProducts();
    console.log(`Shop pictures available: ${products.length}`);
    if (products.length < 4)
      throw new Error("The shop has too few products with pictures to build demo content.");
    console.log(
      `Plan: ${AUTHORS.length} demo authors, ${POSTS.length} photo posts, ${REELS.length} video reels. ${apply ? "" : "(dry run: nothing written)"}`,
    );
    if (apply) {
      const ffmpeg = need("FFMPEG_PATH");
      const work = join(tmpdir(), `fernwood-demo-${randomUUID()}`);
      mkdirSync(work, { recursive: true });

      // Start clean so re-running never piles up duplicates.
      const old = await reels.find({ userId: { $in: ids } }).toArray();
      await removeFiles(old.map((r) => r["storagePath"] as string));
      await reels.deleteMany({ userId: { $in: ids } });

      const authors: { userId: ObjectId; key: string }[] = [];
      for (const [index, name] of AUTHORS.entries()) {
        const email = `demo-${index + 1}@${DEMO_DOMAIN}`;
        const found = await users.findOne({ email });
        const userId = found?._id ?? new ObjectId();
        if (!found) {
          await users.insertOne({
            _id: userId,
            email,
            firstName: name.firstName,
            lastName: name.lastName,
            // Not a valid password hash: nobody can sign in as a demo author.
            passwordHash: "!",
            role: "customer",
            sessions: [],
            acceptsMarketing: false,
            emailVerifiedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        const profile = await profiles.findOne({ userId });
        const publicId =
          (profile?.["publicId"] as string | undefined) ?? randomBytes(8).toString("hex");
        if (!profile)
          await profiles.insertOne({ userId, publicId, isPrivate: false, createdAt: new Date() });
        authors.push({ userId, key: publicId });
      }

      const pictures: string[] = [];
      for (const [i, product] of products.slice(0, 9).entries()) {
        const response = await fetch(
          `${product.image}${product.image.includes("?") ? "&" : "?"}width=1080`,
        );
        const file = join(work, `p${i}.jpg`);
        const { writeFileSync } = await import("node:fs");
        writeFileSync(file, Buffer.from(await response.arrayBuffer()));
        pictures.push(file);
      }

      const now = new Date();
      const insert = async (
        n: number,
        kind: "image" | "video",
        file: string,
        meta: { caption: string; topic: string },
        extra: Record<string, unknown>,
        aspectRatio: number,
      ) => {
        const author = authors[n % authors.length] as { userId: ObjectId; key: string };
        const ext = kind === "image" ? "jpg" : "mp4";
        const path = `${author.key}/${randomUUID()}.${ext}`;
        const bytes = readFileSync(file);
        await upload(path, bytes, kind === "image" ? "image/jpeg" : "video/mp4");
        const linked = [products[n % products.length], products[(n + 3) % products.length]].flatMap(
          (p) => (p ? [p.handle] : []),
        );
        await reels.insertOne({
          userId: author.userId,
          kind,
          storagePath: path,
          contentType: kind === "image" ? "image/jpeg" : "video/mp4",
          sizeBytes: statSync(file).size,
          caption: meta.caption,
          topic: meta.topic,
          productHandles: [...new Set(linked)],
          status: "approved",
          likeCount: 8 + ((n * 37) % 140),
          commentCount: 0,
          reportCount: 0,
          aspectRatio,
          createdAt: new Date(now.getTime() - n * 40 * 60_000),
          approvedAt: now,
          ...extra,
        });
        console.log(`  ${kind} ${path} (${(bytes.length / 1024).toFixed(0)} KB)`);
      };

      for (const [n, post] of POSTS.entries()) {
        const picture = shaped(
          ffmpeg,
          pictures[n % pictures.length] as string,
          SHAPES[n % SHAPES.length] ?? "original",
          join(work, `s${n}.jpg`),
        );
        await insert(n, "image", picture.file, post, {}, picture.ratio);
      }
      for (const [n, reel] of REELS.entries()) {
        const source = pictures[(n + 2) % pictures.length] as string;
        const out = join(work, `r${n}.mp4`);
        // A slow push-in on the picture, vertical 720x1280, H.264, well under the 5 MB limit.
        execFileSync(
          ffmpeg,
          [
            "-y",
            "-loop",
            "1",
            "-i",
            source,
            "-t",
            String(reel.seconds),
            "-vf",
            `scale=1440:2560:force_original_aspect_ratio=increase,crop=1440:2560,zoompan=z='min(zoom+0.0012,1.25)':d=${reel.seconds * 25}:s=720x1280:fps=25,format=yuv420p`,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "30",
            "-movflags",
            "+faststart",
            "-an",
            out,
          ],
          { stdio: "ignore" },
        );
        await insert(
          n + POSTS.length,
          "video",
          out,
          reel,
          {
            durationMs: reel.seconds * 1000,
            expiresAt: new Date(now.getTime() + 7 * 24 * 3600_000),
          },
          9 / 16,
        );
      }
      rmSync(work, { recursive: true, force: true });
      console.log(
        "Done. Demo reels expire after 7 days; re-run --apply to refresh, --remove to delete.",
      );
    }
  }
} finally {
  await mongo.close();
}
