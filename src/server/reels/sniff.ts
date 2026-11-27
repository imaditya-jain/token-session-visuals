import "server-only";

/**
 * Identifies the real file type from its first bytes. The type a client declares is only a claim: an HTML
 * page uploaded as "image/jpeg" must never be served from our storage as a picture.
 */
export type SniffedMedia = "image" | "video" | null;

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

export function sniffMedia(bytes: Uint8Array): SniffedMedia {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image"; // JPEG
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image"; // PNG
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image"; // WebP
  }
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return "video"; // MP4 / QuickTime ("ftyp")
  return null;
}
