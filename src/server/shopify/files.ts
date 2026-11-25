import "server-only";

import { z } from "zod";

import { adminQuery } from "./admin";
import { ShopifyError } from "./client";

const userErrors = z.array(
  z.object({ message: z.string(), field: z.array(z.string()).nullable().optional() }),
);

const stagedResponse = z.object({
  stagedUploadsCreate: z.object({
    stagedTargets: z.array(
      z.object({
        url: z.string(),
        resourceUrl: z.string(),
        parameters: z.array(z.object({ name: z.string(), value: z.string() })),
      }),
    ),
    userErrors,
  }),
});

const fileCreateResponse = z.object({
  fileCreate: z.object({
    files: z.array(z.object({ id: z.string(), fileStatus: z.string() })),
    userErrors,
  }),
});

const fileNodeResponse = z.object({
  node: z
    .object({
      id: z.string(),
      fileStatus: z.string().optional(),
      image: z
        .object({
          url: z.string().nullable(),
          width: z.number().nullable().optional(),
          height: z.number().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable(),
});

const fileUpdateResponse = z.object({ fileUpdate: z.object({ userErrors }) });
const fileDeleteResponse = z.object({
  fileDelete: z.object({ deletedFileIds: z.array(z.string()).nullable(), userErrors }),
});

const STAGE = /* GraphQL */ `
  mutation Stage($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE = /* GraphQL */ `
  mutation CreateFile($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const POLL = /* GraphQL */ `
  query FileStatus($id: ID!) {
    node(id: $id) {
      id
      ... on MediaImage {
        fileStatus
        image {
          url
          width
          height
        }
      }
    }
  }
`;

const UPDATE = /* GraphQL */ `
  mutation UpdateFile($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE = /* GraphQL */ `
  mutation DeleteFile($fileIds: [ID!]!) {
    fileDelete(fileIds: $fileIds) {
      deletedFileIds
      userErrors {
        field
        message
      }
    }
  }
`;

const fail = (what: string, errors: { message: string }[]): never => {
  throw new ShopifyError(`Shopify ${what}: ${errors.map((e) => e.message).join("; ")}`);
};

export type UploadedImage = { gid: string; url: string; width?: number; height?: number };

const GID = /^gid:\/\/shopify\/(MediaImage|GenericFile)\/\d+$/;
export const isFileGid = (value: string): boolean => GID.test(value);

/** The permanent home of processed files. Staged-upload addresses live on a different host and expire. */
export const isPermanentCdnUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "cdn.shopify.com";
  } catch {
    return false;
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type FileInput = { bytes: Uint8Array; filename: string; mimeType: string };

/** Stages an upload and sends the bytes to the staged target; returns the temporary source Shopify will read from. */
async function stageAndSend(file: FileInput): Promise<string> {
  const staged = stagedResponse.parse(
    await adminQuery(STAGE, {
      input: [
        {
          resource: "IMAGE",
          filename: file.filename,
          mimeType: file.mimeType,
          httpMethod: "POST",
          fileSize: String(file.bytes.byteLength),
        },
      ],
    }),
  ).stagedUploadsCreate;
  const target = staged.stagedTargets[0];
  if (!target || staged.userErrors.length) return fail("stagedUploadsCreate", staged.userErrors);
  if (!target.url.startsWith("https://"))
    throw new ShopifyError("Shopify returned a non-https upload target");

  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append("file", new Blob([file.bytes as BlobPart], { type: file.mimeType }), file.filename);
  const sent = await fetch(target.url, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!sent.ok)
    throw new ShopifyError(`Shopify upload target responded ${sent.status}`, sent.status);
  return target.resourceUrl;
}

type PollOptions = { pollIntervalMs?: number; timeoutMs?: number };

/**
 * Waits until Shopify has processed the file and returns its final, permanent address. A failed or never-finishing
 * file is NOT deleted here: the caller decides (a replacement must leave the original untouched).
 */
async function waitUntilReady(gid: string, options: PollOptions): Promise<UploadedImage> {
  const interval = options.pollIntervalMs ?? 1000;
  const deadline = Date.now() + (options.timeoutMs ?? 25_000);
  while (Date.now() < deadline) {
    const { node } = fileNodeResponse.parse(await adminQuery(POLL, { id: gid }));
    if (node?.fileStatus === "FAILED")
      throw new ShopifyError("Shopify could not process the image");
    if (node?.fileStatus === "READY" && node.image?.url) {
      // The upload target's address is temporary. Only the permanent CDN address of the processed file is ever
      // returned (and therefore stored); anything else is treated as a failure.
      if (!isPermanentCdnUrl(node.image.url))
        throw new ShopifyError("Shopify returned an address that isn't a permanent CDN link");
      return {
        gid,
        url: node.image.url,
        ...(node.image.width ? { width: node.image.width } : {}),
        ...(node.image.height ? { height: node.image.height } : {}),
      };
    }
    await wait(interval);
  }
  throw new ShopifyError("Shopify is still processing the image; please try again");
}

/**
 * Uploads an image to Shopify Files: stage the upload, send the bytes to the staged target, register the file and
 * wait until Shopify has processed it (so the returned URL is final and serves). Throws on any failure, never
 * pretending an upload succeeded.
 */
export async function uploadImageToShopify(
  file: FileInput,
  alt: string,
  options: PollOptions = {},
): Promise<UploadedImage> {
  const resourceUrl = await stageAndSend(file);
  const created = fileCreateResponse.parse(
    await adminQuery(CREATE, {
      files: [{ originalSource: resourceUrl, contentType: "IMAGE", alt, filename: file.filename }],
    }),
  ).fileCreate;
  const made = created.files[0];
  if (!made || created.userErrors.length) return fail("fileCreate", created.userErrors);
  try {
    return await waitUntilReady(made.id, options);
  } catch (error) {
    // Don't leave a failed or half-processed file behind in the merchant's library.
    await deleteShopifyFile(made.id).catch(() => undefined);
    throw error;
  }
}

/** Replaces the picture of an existing file in place (same Shopify file, new bytes). */
export async function replaceShopifyFileImage(
  gid: string,
  file: FileInput,
  options: PollOptions = {},
): Promise<UploadedImage> {
  const resourceUrl = await stageAndSend(file);
  const { fileUpdate } = fileUpdateResponse.parse(
    await adminQuery(UPDATE, {
      files: [{ id: gid, originalSource: resourceUrl, filename: file.filename }],
    }),
  );
  if (fileUpdate.userErrors.length) return fail("fileUpdate", fileUpdate.userErrors);
  return waitUntilReady(gid, options);
}

export async function updateShopifyFileAlt(gid: string, alt: string): Promise<void> {
  const { fileUpdate } = fileUpdateResponse.parse(
    await adminQuery(UPDATE, { files: [{ id: gid, alt }] }),
  );
  if (fileUpdate.userErrors.length) fail("fileUpdate", fileUpdate.userErrors);
}

export async function deleteShopifyFile(gid: string): Promise<void> {
  const { fileDelete } = fileDeleteResponse.parse(await adminQuery(DELETE, { fileIds: [gid] }));
  if (fileDelete.userErrors.length) fail("fileDelete", fileDelete.userErrors);
}
