// @vitest-environment node
import { describe, expect, it } from "vitest";

import { sniffImage } from "./image-sniff";

const bytes = (...values: number[]) => new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

describe("sniffImage", () => {
  it("recognises the four allowed formats by their signatures", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.mimeType).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mimeType).toBe(
      "image/png",
    );
    expect(sniffImage(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))?.mimeType).toBe(
      "image/webp",
    );
    expect(sniffImage(bytes(...ascii("GIF89a")))?.mimeType).toBe("image/gif");
    expect(sniffImage(bytes(...ascii("GIF87a")))?.mimeType).toBe("image/gif");
  });

  it("refuses SVG, HTML, scripts, PDFs, empty input and truncated signatures", () => {
    for (const text of [
      '<svg xmlns="http://www.w3.org/2000/svg" onload="x()">',
      "<!doctype html><script>",
      "%PDF-1.7",
      "GIF8",
    ]) {
      expect(sniffImage(new Uint8Array(ascii(text)))).toBeNull();
    }
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(sniffImage(bytes(0xff, 0xd8))).toBeNull();
    // A RIFF container that isn't WebP (e.g. WAV) is not an image.
    expect(sniffImage(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")))).toBeNull();
  });
});
