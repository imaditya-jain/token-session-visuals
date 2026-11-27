import { describe, expect, it } from "vitest";

import { sniffMedia } from "./sniff";

const pad = (bytes: number[]) =>
  Uint8Array.from([...bytes, ...new Array(Math.max(0, 64 - bytes.length)).fill(0)]);

describe("sniffMedia", () => {
  it("recognises JPEG, PNG, WebP and MP4", () => {
    expect(sniffMedia(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image");
    expect(sniffMedia(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image");
    const webp = pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffMedia(webp)).toBe("image");
    const mp4 = pad([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(sniffMedia(mp4)).toBe("video");
  });

  it("rejects HTML, SVG, scripts and short input", () => {
    const text = (value: string) => pad([...new TextEncoder().encode(value)]);
    expect(sniffMedia(text("<!doctype html><script>"))).toBeNull();
    expect(sniffMedia(text("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(sniffMedia(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("does not treat a RIFF file that is not WebP as a picture", () => {
    expect(
      sniffMedia(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])),
    ).toBeNull();
  });
});
