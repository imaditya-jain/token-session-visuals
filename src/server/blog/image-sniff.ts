import "server-only";

export type ImageKind = {
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  extension: string;
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value);

/**
 * Identifies an image by its first bytes, never by the filename or the browser's claimed type (both are
 * attacker-controlled). SVG is deliberately absent: it can carry scripts. Returns null for anything else.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mimeType: "image/png", extension: "png" };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return { mimeType: "image/webp", extension: "webp" };
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  )
    return { mimeType: "image/gif", extension: "gif" };
  return null;
}
