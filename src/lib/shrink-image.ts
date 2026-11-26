/**
 * Shrinks a photo in the browser before it is uploaded: a phone camera photo is often 5-12 MB, far more than the
 * upload limit and more than the Plant Doctor needs. Returns a JPEG no larger than `maxSide` on its longest edge.
 * The camera's rotation is applied by the browser, and GPS and other metadata are dropped by re-encoding.
 */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("could not encode");
    return blob;
  } finally {
    bitmap.close();
  }
}
