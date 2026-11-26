import "server-only";

import sharp from "sharp";

import { AppError } from "@/server/http/errors";

const MIN_SIDE = 200;
const MAX_SIDE = 1568;

type Sniffed = "jpeg" | "png" | "webp";

/** The real type comes from the first bytes, never from the file name or the declared content type. */
export function sniffImage(bytes: Uint8Array): Sniffed | null {
  if (bytes.length > 12) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
      return "png";
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    const webp = String.fromCharCode(...bytes.subarray(8, 12));
    if (riff === "RIFF" && webp === "WEBP") return "webp";
  }
  return null;
}

/**
 * Makes an uploaded photo safe and small enough to analyse: checks the real format, applies the camera's rotation,
 * shrinks it to what the model can use (so a 12 MP phone photo costs the same as a 2 MP one), re-encodes as JPEG
 * and drops all metadata, including GPS position. The original is never kept.
 */
export async function prepareImage(
  input: Uint8Array,
): Promise<{ jpeg: Buffer; width: number; height: number }> {
  if (!sniffImage(input)) {
    throw new AppError(415, "unsupported_image", "Please upload a JPEG, PNG or WebP photo.");
  }
  try {
    const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (Math.min(info.width, info.height) < MIN_SIDE) {
      throw new AppError(
        422,
        "image_too_small",
        "That photo is too small to see the leaves. Try a closer, larger photo.",
      );
    }
    return { jpeg: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      "unreadable_image",
      "We couldn't read that photo. Try taking it again.",
    );
  }
}
