// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adminQuery = vi.fn();
vi.mock("./admin", () => ({ adminQuery: (...args: unknown[]) => adminQuery(...args) }));

import { deleteShopifyFile, updateShopifyFileAlt, uploadImageToShopify } from "./files";

const file = { bytes: new Uint8Array([1, 2, 3]), filename: "fern.png", mimeType: "image/png" };
const GID = "gid://shopify/MediaImage/42";
const staged = (url = "https://storage.example/upload") => ({
  stagedUploadsCreate: {
    stagedTargets: [
      {
        url,
        resourceUrl: "https://storage.example/resource",
        parameters: [{ name: "key", value: "k" }],
      },
    ],
    userErrors: [],
  },
});
const created = { fileCreate: { files: [{ id: GID, fileStatus: "UPLOADED" }], userErrors: [] } };
const node = (fileStatus: string, image: unknown = null) => ({
  node: { id: GID, fileStatus, image },
});

let upload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  adminQuery.mockReset();
  upload = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", upload);
});
afterEach(() => vi.unstubAllGlobals());

const fast = { pollIntervalMs: 1, timeoutMs: 200 };

describe("uploadImageToShopify", () => {
  it("stages, uploads the bytes, registers the file and waits until it is ready", async () => {
    adminQuery
      .mockResolvedValueOnce(staged())
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(node("PROCESSING"))
      .mockResolvedValueOnce(
        node("READY", {
          url: "https://cdn.shopify.com/s/files/1/fern.png",
          width: 800,
          height: 600,
        }),
      );

    const result = await uploadImageToShopify(file, "A fern", fast);

    expect(result).toEqual({
      gid: GID,
      url: "https://cdn.shopify.com/s/files/1/fern.png",
      width: 800,
      height: 600,
    });
    expect(upload).toHaveBeenCalledTimes(1);
    const [url, init] = upload.mock.calls[0] as [string, { method: string; body: FormData }];
    expect(url).toBe("https://storage.example/upload");
    expect(init.method).toBe("POST");
    const keys = [...init.body.keys()];
    expect(keys).toEqual(["key", "file"]); // the staged parameters first, the file last (a storage requirement)
    expect(adminQuery.mock.calls[0]?.[1]).toMatchObject({
      input: [
        {
          resource: "IMAGE",
          filename: "fern.png",
          mimeType: "image/png",
          httpMethod: "POST",
          fileSize: "3",
        },
      ],
    });
    expect(adminQuery.mock.calls[1]?.[1]).toMatchObject({
      files: [
        { originalSource: "https://storage.example/resource", contentType: "IMAGE", alt: "A fern" },
      ],
    });
  });

  it("never returns the temporary upload address, only the permanent CDN one", async () => {
    adminQuery
      .mockResolvedValueOnce(staged())
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(
        node("READY", {
          url: "https://shopify-staged-uploads.storage.googleapis.com/tmp/fern.png",
        }),
      )
      .mockResolvedValueOnce({ fileDelete: { deletedFileIds: [GID], userErrors: [] } });
    await expect(uploadImageToShopify(file, "", fast)).rejects.toThrow(/permanent CDN/);
    expect(String(adminQuery.mock.calls.at(-1)?.[0])).toContain("fileDelete");
  });

  it("refuses a non-https upload target before sending any bytes", async () => {
    adminQuery.mockResolvedValueOnce(staged("http://insecure.example/upload"));
    await expect(uploadImageToShopify(file, "", fast)).rejects.toThrow(/non-https/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports Shopify's own errors instead of pretending it worked", async () => {
    adminQuery.mockResolvedValueOnce({
      stagedUploadsCreate: { stagedTargets: [], userErrors: [{ message: "Quota exceeded" }] },
    });
    await expect(uploadImageToShopify(file, "", fast)).rejects.toThrow(/Quota exceeded/);

    adminQuery.mockReset();
    adminQuery.mockResolvedValueOnce(staged()).mockResolvedValueOnce({
      fileCreate: { files: [], userErrors: [{ message: "Invalid file" }] },
    });
    await expect(uploadImageToShopify(file, "", fast)).rejects.toThrow(/Invalid file/);
  });

  it("fails when the storage target rejects the bytes", async () => {
    adminQuery.mockResolvedValueOnce(staged());
    upload.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(uploadImageToShopify(file, "", fast)).rejects.toThrow(/403/);
  });

  it("deletes the file and fails when Shopify can't process it", async () => {
    adminQuery
      .mockResolvedValueOnce(staged())
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(node("FAILED"))
      .mockResolvedValueOnce({ fileDelete: { deletedFileIds: [GID], userErrors: [] } });
    await expect(uploadImageToShopify(file, "", fast)).rejects.toThrow(/could not process/);
    expect(String(adminQuery.mock.calls.at(-1)?.[0])).toContain("fileDelete");
  });

  it("cleans up and fails when processing takes too long", async () => {
    adminQuery
      .mockResolvedValueOnce(staged())
      .mockResolvedValueOnce(created)
      .mockResolvedValue(node("PROCESSING"));
    await expect(
      uploadImageToShopify(file, "", { pollIntervalMs: 5, timeoutMs: 30 }),
    ).rejects.toThrow(/still processing/);
    expect(adminQuery.mock.calls.some(([query]) => String(query).includes("fileDelete"))).toBe(
      true,
    );
  });
});

describe("file updates", () => {
  it("updates alt text and surfaces refusals", async () => {
    adminQuery.mockResolvedValueOnce({ fileUpdate: { userErrors: [] } });
    await updateShopifyFileAlt(GID, "New alt");
    expect(adminQuery.mock.calls[0]?.[1]).toEqual({ files: [{ id: GID, alt: "New alt" }] });

    adminQuery.mockResolvedValueOnce({ fileUpdate: { userErrors: [{ message: "No such file" }] } });
    await expect(updateShopifyFileAlt(GID, "x")).rejects.toThrow(/No such file/);
  });

  it("deletes files and surfaces refusals", async () => {
    adminQuery.mockResolvedValueOnce({ fileDelete: { deletedFileIds: [GID], userErrors: [] } });
    await expect(deleteShopifyFile(GID)).resolves.toBeUndefined();
    adminQuery.mockResolvedValueOnce({
      fileDelete: { deletedFileIds: null, userErrors: [{ message: "Nope" }] },
    });
    await expect(deleteShopifyFile(GID)).rejects.toThrow(/Nope/);
  });
});
