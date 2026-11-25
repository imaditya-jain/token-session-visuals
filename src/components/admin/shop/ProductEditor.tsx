"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import MediaPicker from "@/components/admin/blog/MediaPicker";
import IconButton from "@/components/admin/IconButton";
import PageHeader from "@/components/admin/PageHeader";
import VariantsEditor from "@/components/admin/shop/VariantsEditor";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { moveItem } from "@/lib/array-edit";
import type { MediaView } from "@/lib/blog-types";
import { newVariant, parseValues, reconcileVariants } from "@/lib/product-variants";
import {
  createProductSchema,
  numericOf,
  PRODUCT_STATUSES,
  STATUS_NAMES,
  type CollectionOption,
  type ProductDetail,
  type ProductStatus,
  type VariantInput,
} from "@/lib/products";
import { useAppSelector } from "@/store/hooks";
import Skeleton from "@/components/admin/Skeleton";

const DescriptionEditor = dynamic(() => import("@/components/admin/shop/DescriptionEditor"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="min-h-[12rem] rounded-lg border border-input p-4 text-sm text-muted-foreground"
    >
      Loading editor…
    </div>
  ),
});

const field =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

const messageOf = (error: unknown): string => {
  if (error instanceof ApiError) {
    const fields = error.fields?.map((f) => f.message).filter(Boolean);
    return fields?.length ? [...new Set(fields)].slice(0, 3).join(" ") : error.message;
  }
  return "Network problem. Check your connection and try again.";
};

function Box({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-border/60">
      <h2 className="font-display text-lg text-forest">{title}</h2>
      {hint ? (
        <p className="mb-3 mt-1 text-sm text-muted-foreground">{hint}</p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </section>
  );
}

type Form = {
  title: string;
  descriptionHtml: string;
  status: ProductStatus;
  vendor: string;
  productType: string;
  tagsText: string;
  handle: string;
  seoTitle: string;
  seoDescription: string;
  collectionIds: string[];
};

const formOf = (p: ProductDetail | null, collectionIds: string[] = []): Form => ({
  title: p?.title ?? "",
  descriptionHtml: p?.descriptionHtml ?? "",
  status: p?.status ?? "DRAFT",
  vendor: p?.vendor ?? "",
  productType: p?.productType ?? "",
  tagsText: p?.tags.join(", ") ?? "",
  handle: p?.handle ?? "",
  seoTitle: p?.seoTitle ?? "",
  seoDescription: p?.seoDescription ?? "",
  collectionIds: p ? p.collections.map((c) => c.id) : collectionIds,
});

const variantsOf = (p: ProductDetail): VariantInput[] =>
  p.variants.map((v) => ({
    id: v.id,
    optionValues: v.optionValues,
    sku: v.sku,
    barcode: v.barcode,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    costPerItem: v.costPerItem,
    taxable: v.taxable,
    trackInventory: v.trackInventory,
    inventoryPolicy: v.inventoryPolicy,
    requiresShipping: v.requiresShipping,
    weight: v.weight,
    mediaId: v.mediaId,
  }));

const tagsOf = (text: string): string[] => [
  ...new Set(
    text
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];

function Editor({
  initial,
  collections,
}: {
  initial: ProductDetail | null;
  collections: CollectionOption[];
}) {
  const router = useRouter();
  const permissions = useAppSelector((s) => s.admin.access?.permissions ?? []);
  const canDelete = permissions.includes("products:delete");

  const [product, setProduct] = useState(initial);
  const [form, setForm] = useState<Form>(() => formOf(initial));
  const [variants, setVariants] = useState<VariantInput[]>(() =>
    initial ? variantsOf(initial) : [newVariant([], "")],
  );
  const [newOptions, setNewOptions] = useState<{ name: string; valuesText: string }[]>([]);
  const [defaultPrice, setDefaultPrice] = useState("");
  const [savedKey, setSavedKey] = useState(() =>
    JSON.stringify([formOf(initial), initial ? variantsOf(initial) : []]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [channelIds, setChannelIds] = useState<string[]>(
    () => initial?.channels.filter((c) => c.published).map((c) => c.id) ?? [],
  );
  const [optionDraft, setOptionDraft] = useState({ name: "", valuesText: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = JSON.stringify([form, variants]) !== savedKey;
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const adopt = (next: ProductDetail, message?: string) => {
    setProduct(next);
    const nextForm = formOf(next);
    const nextVariants = variantsOf(next);
    setForm(nextForm);
    setVariants(nextVariants);
    setSavedKey(JSON.stringify([nextForm, nextVariants]));
    setChannelIds(next.channels.filter((c) => c.published).map((c) => c.id));
    if (message) setNotice(message);
  };

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const productFields = () => ({
    title: form.title,
    descriptionHtml: form.descriptionHtml,
    status: form.status,
    vendor: form.vendor,
    productType: form.productType,
    tags: tagsOf(form.tagsText),
    handle: form.handle,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    collectionIds: form.collectionIds,
  });

  const options = newOptions.map((o) => ({
    name: o.name.trim(),
    values: parseValues(o.valuesText),
  }));

  const rebuildVariants = (next: { name: string; valuesText: string }[], price = defaultPrice) => {
    const usable = next
      .filter((o) => o.name.trim() && parseValues(o.valuesText).length > 0)
      .map((o) => ({ values: parseValues(o.valuesText) }));
    const rebuilt =
      usable.length === 0 ? [newVariant([], price)] : reconcileVariants(usable, variants, price);
    if (!rebuilt) {
      setError("That makes more than 100 variants. Remove some option values.");
      return;
    }
    setError(null);
    setVariants(rebuilt);
  };

  const create = () =>
    act(async () => {
      const body = {
        product: productFields(),
        options: options.filter((o) => o.name && o.values.length),
        variants,
      };
      const parsed = createProductSchema.safeParse(body);
      if (!parsed.success) {
        setError(
          parsed.error.issues
            .slice(0, 3)
            .map((i) => i.message)
            .join(" "),
        );
        return;
      }
      const { product: made } = await apiFetch<{ product: ProductDetail }>("/api/admin/products", {
        method: "POST",
        json: body,
      });
      setSavedKey(JSON.stringify([form, variants]));
      router.replace(`/admin/shop/products/${numericOf(made.id)}`);
    });

  const save = () =>
    act(async () => {
      if (!product) return;
      const base = `/api/admin/products/${numericOf(product.id)}`;
      const { handle, ...rest } = productFields();
      const patch = { ...rest, ...(handle ? { handle } : {}) };
      let next = (
        await apiFetch<{ product: ProductDetail }>(base, {
          method: "PATCH",
          json: { product: patch },
        })
      ).product;
      if (JSON.stringify(variants) !== JSON.stringify(variantsOf(product))) {
        next = (
          await apiFetch<{ product: ProductDetail }>(`${base}/variants`, {
            method: "PUT",
            json: { variants },
          })
        ).product;
      }
      adopt(next, "Saved to Shopify.");
    });

  const call = (path: string, method: string, json: unknown, message: string) =>
    act(async () => {
      if (!product) return;
      const { product: next } = await apiFetch<{ product: ProductDetail }>(
        `/api/admin/products/${numericOf(product.id)}${path}`,
        { method, json },
      );
      adopt(next, message);
    });

  const pickImage = (media: MediaView) =>
    void call(
      "/images",
      "POST",
      { images: [{ url: media.url, alt: media.alt }] },
      "Image added. Shopify may take a moment to process it.",
    );

  const setArchived = (archive: boolean) =>
    act(async () => {
      if (!product) return;
      const { product: next } = await apiFetch<{ product: ProductDetail }>(
        `/api/admin/products/${numericOf(product.id)}`,
        {
          method: "PATCH",
          json: { product: { status: archive ? "ARCHIVED" : "DRAFT" } },
        },
      );
      adopt(next, archive ? "Archived. It is no longer sold." : "Restored as a draft.");
    });

  const remove = () =>
    act(async () => {
      if (!product) return;
      await apiFetch(`/api/admin/products/${numericOf(product.id)}`, { method: "DELETE" });
      router.push("/admin/shop/products");
    });

  const isNew = product === null;
  const currency = product?.currency ?? "USD";

  return (
    <>
      <PageHeader
        title={isNew ? "New product" : (product?.title ?? "Product")}
        lead={isNew ? "It is created in Shopify and published on your sales channels." : undefined}
        action={
          <Button asChild variant="outline" className="h-11">
            <Link href="/admin/shop/products">All products</Link>
          </Button>
        }
      />
      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mb-5 rounded-md border border-sage/50 bg-sage-light/50 px-4 py-3 text-sm text-forest"
        >
          {notice}
        </p>
      ) : null}

      <fieldset disabled={busy} className="min-w-0 border-0 p-0">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-6">
            <Box title="Details">
              <div className="space-y-4">
                <div>
                  <label htmlFor="p-title" className="mb-1.5 block text-sm font-medium">
                    Title
                  </label>
                  <input
                    id="p-title"
                    className={field}
                    maxLength={255}
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Description</p>
                  <DescriptionEditor
                    initial={form.descriptionHtml}
                    onChange={(html) => set("descriptionHtml", html)}
                  />
                </div>
              </div>
            </Box>

            {product ? (
              <Box
                title="Images"
                hint="Pictures from your media library. The first one is the main image."
              >
                <ul aria-label="Product images" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {product.media.map((m, index) => (
                    <li key={m.id} className="rounded-lg bg-background p-2 ring-1 ring-border/60">
                      <Image
                        src={m.url}
                        alt={m.alt || "Product image"}
                        width={m.width ?? 300}
                        height={m.height ?? 300}
                        sizes="160px"
                        className="aspect-square w-full rounded-md bg-sand object-cover"
                      />
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {index === 0 ? "Main" : `#${index + 1}`}
                        </span>
                        <span className="flex">
                          <IconButton
                            label={`Move image ${index + 1} earlier`}
                            disabled={index === 0}
                            onClick={() =>
                              void call(
                                "/images",
                                "PUT",
                                { mediaIds: moveItem(product.media, index, -1).map((x) => x.id) },
                                "Image order saved.",
                              )
                            }
                          >
                            ←
                          </IconButton>
                          <IconButton
                            label={`Move image ${index + 1} later`}
                            disabled={index === product.media.length - 1}
                            onClick={() =>
                              void call(
                                "/images",
                                "PUT",
                                { mediaIds: moveItem(product.media, index, 1).map((x) => x.id) },
                                "Image order saved.",
                              )
                            }
                          >
                            →
                          </IconButton>
                          <IconButton
                            label={`Remove image ${index + 1}`}
                            danger
                            onClick={() =>
                              void call("/images", "DELETE", { mediaIds: [m.id] }, "Image removed.")
                            }
                          >
                            ✕
                          </IconButton>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-11"
                  onClick={() => setPicking(true)}
                >
                  Add from media library
                </Button>
                <MediaPicker open={picking} onOpenChange={setPicking} onPick={pickImage} />
              </Box>
            ) : (
              <p className="text-sm text-muted-foreground">
                You can add images as soon as the product is created.
              </p>
            )}

            <Box
              title="Options and variants"
              hint="Options (such as Size) create variants, each with its own price, SKU and stock."
            >
              {isNew ? (
                <div className="mb-5 space-y-3">
                  {newOptions.map((o, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-lg bg-background p-3 ring-1 ring-border/60 sm:grid-cols-[12rem_1fr_auto]"
                    >
                      <div>
                        <label
                          htmlFor={`no-name-${index}`}
                          className="mb-1 block text-xs text-muted-foreground"
                        >
                          Option name
                        </label>
                        <input
                          id={`no-name-${index}`}
                          className={field}
                          placeholder="Size"
                          value={o.name}
                          onChange={(e) => {
                            const next = newOptions.map((x, i) =>
                              i === index ? { ...x, name: e.target.value } : x,
                            );
                            setNewOptions(next);
                            rebuildVariants(next);
                          }}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`no-values-${index}`}
                          className="mb-1 block text-xs text-muted-foreground"
                        >
                          Values, separated by commas
                        </label>
                        <input
                          id={`no-values-${index}`}
                          className={field}
                          placeholder="Small, Medium, Large"
                          value={o.valuesText}
                          onChange={(e) => {
                            const next = newOptions.map((x, i) =>
                              i === index ? { ...x, valuesText: e.target.value } : x,
                            );
                            setNewOptions(next);
                            rebuildVariants(next);
                          }}
                        />
                      </div>
                      <IconButton
                        label={`Remove option ${o.name || index + 1}`}
                        danger
                        onClick={() => {
                          const next = newOptions.filter((_, i) => i !== index);
                          setNewOptions(next);
                          rebuildVariants(next);
                        }}
                      >
                        ✕
                      </IconButton>
                    </div>
                  ))}
                  {newOptions.length < 3 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => setNewOptions([...newOptions, { name: "", valuesText: "" }])}
                    >
                      Add an option
                    </Button>
                  ) : null}
                  <div className="max-w-xs">
                    <label
                      htmlFor="default-price"
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      Starting price for new variants ({currency})
                    </label>
                    <input
                      id="default-price"
                      className={field}
                      inputMode="decimal"
                      value={defaultPrice}
                      onChange={(e) => {
                        setDefaultPrice(e.target.value);
                        setVariants((vs) =>
                          vs.map((v) =>
                            v.price === "" || v.price === defaultPrice
                              ? { ...v, price: e.target.value }
                              : v,
                          ),
                        );
                      }}
                    />
                  </div>
                </div>
              ) : product ? (
                <div className="mb-5 space-y-3">
                  {product.options.map((o) => (
                    <div key={o.id} className="rounded-lg bg-background p-3 ring-1 ring-border/60">
                      <p className="text-sm font-medium">
                        {o.name}:{" "}
                        <span className="font-normal text-muted-foreground">
                          {o.values.join(", ")}
                        </span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div>
                          <label
                            htmlFor={`add-${o.id}`}
                            className="mb-1 block text-xs text-muted-foreground"
                          >
                            Add values to {o.name}
                          </label>
                          <input
                            id={`add-${o.id}`}
                            className={`${field} w-56`}
                            placeholder="Value, Another"
                            value={optionDraft.name === o.id ? optionDraft.valuesText : ""}
                            onChange={(e) =>
                              setOptionDraft({ name: o.id, valuesText: e.target.value })
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11"
                          disabled={
                            optionDraft.name !== o.id ||
                            parseValues(optionDraft.valuesText).length === 0
                          }
                          onClick={() =>
                            void call(
                              "/options",
                              "PATCH",
                              { optionId: o.id, addValues: parseValues(optionDraft.valuesText) },
                              "Values added. New variants were created in Shopify; set their prices below.",
                            ).then(() => setOptionDraft({ name: "", valuesText: "" }))
                          }
                        >
                          Add values
                        </Button>
                        {canDelete && product.options.length > 1 ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            onClick={() =>
                              void call(
                                "/options",
                                "DELETE",
                                { optionId: o.id },
                                `Option ${o.name} removed.`,
                              )
                            }
                          >
                            Remove option<span className="sr-only"> {o.name}</span>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <NewOptionForm
                    busy={busy}
                    onAdd={(option) =>
                      call("/options", "POST", { option }, `Option ${option.name} added.`)
                    }
                  />
                </div>
              ) : null}
              <VariantsEditor
                variants={variants}
                onChange={setVariants}
                optionNames={
                  isNew
                    ? options.filter((o) => o.name && o.values.length).map((o) => o.name)
                    : (product?.options.map((o) => o.name) ?? [])
                }
                currency={currency}
                {...(product ? { current: product.variants } : {})}
              />
              {product && !isNew ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Stock is changed on the Inventory page.
                </p>
              ) : null}
            </Box>

            <Box title="Search appearance">
              <div className="space-y-4">
                <div>
                  <label htmlFor="p-handle" className="mb-1.5 block text-sm font-medium">
                    URL handle
                  </label>
                  <input
                    id="p-handle"
                    className={`${field} font-mono`}
                    value={form.handle}
                    placeholder="created from the title"
                    onChange={(e) => set("handle", e.target.value.toLowerCase())}
                  />
                </div>
                <div>
                  <label htmlFor="p-seo-title" className="mb-1.5 block text-sm font-medium">
                    SEO title
                  </label>
                  <input
                    id="p-seo-title"
                    className={field}
                    maxLength={255}
                    value={form.seoTitle}
                    onChange={(e) => set("seoTitle", e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="p-seo-desc" className="mb-1.5 block text-sm font-medium">
                    Meta description
                  </label>
                  <textarea
                    id="p-seo-desc"
                    rows={2}
                    maxLength={5000}
                    value={form.seoDescription}
                    onChange={(e) => set("seoDescription", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </Box>
          </div>

          <aside aria-label="Product settings" className="min-w-0 space-y-6">
            <Box title="Save">
              <div className="space-y-3">
                <Button
                  className="h-11 w-full"
                  disabled={busy || (!isNew && !dirty)}
                  onClick={() => void (isNew ? create() : save())}
                >
                  {busy ? "Saving…" : isNew ? "Create product" : "Save changes"}
                </Button>
                {dirty && !isNew ? (
                  <p className="text-xs text-muted-foreground">You have unsaved changes.</p>
                ) : null}
              </div>
            </Box>

            <Box
              title="Status"
              hint="Only Active products can be bought. Active products are published on your sales channels."
            >
              <label htmlFor="p-status" className="sr-only">
                Status
              </label>
              <select
                id="p-status"
                className={field}
                value={form.status}
                onChange={(e) => set("status", e.target.value as ProductStatus)}
              >
                {PRODUCT_STATUSES.filter((s) => s !== "ARCHIVED" || !isNew).map((s) => (
                  <option key={s} value={s} disabled={s === "ARCHIVED" && !canDelete}>
                    {STATUS_NAMES[s]}
                  </option>
                ))}
              </select>
            </Box>

            {product ? (
              <Box
                title="Sales channels"
                hint="A product is only visible to customers on the channels it is published to. Your website reads through its own channel."
              >
                <fieldset>
                  <legend className="sr-only">Sales channels</legend>
                  <div className="space-y-0.5">
                    {product.channels.map((channel) => (
                      <label
                        key={channel.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--forest)]"
                          checked={channelIds.includes(channel.id)}
                          onChange={(e) =>
                            setChannelIds(
                              e.target.checked
                                ? [...channelIds, channel.id]
                                : channelIds.filter((id) => id !== channel.id),
                            )
                          }
                        />
                        {channel.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-11 w-full"
                  disabled={
                    busy ||
                    JSON.stringify([...channelIds].sort()) ===
                      JSON.stringify(
                        product.channels
                          .filter((c) => c.published)
                          .map((c) => c.id)
                          .sort(),
                      )
                  }
                  onClick={() =>
                    void call("/channels", "PUT", { channelIds }, "Sales channels updated.")
                  }
                >
                  Update channels
                </Button>
              </Box>
            ) : null}

            <Box title="Organisation">
              <div className="space-y-4">
                <div>
                  <label htmlFor="p-vendor" className="mb-1.5 block text-sm font-medium">
                    Vendor
                  </label>
                  <input
                    id="p-vendor"
                    className={field}
                    value={form.vendor}
                    onChange={(e) => set("vendor", e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="p-type" className="mb-1.5 block text-sm font-medium">
                    Product type
                  </label>
                  <input
                    id="p-type"
                    className={field}
                    value={form.productType}
                    onChange={(e) => set("productType", e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="p-tags" className="mb-1.5 block text-sm font-medium">
                    Tags
                  </label>
                  <input
                    id="p-tags"
                    className={field}
                    placeholder="Bestseller, New"
                    value={form.tagsText}
                    onChange={(e) => set("tagsText", e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Separate with commas.</p>
                </div>
              </div>
            </Box>

            <Box
              title="Collections"
              hint="Smart collections fill themselves by rules and can't be changed by hand."
            >
              <fieldset>
                <legend className="sr-only">Collections</legend>
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  {collections.map((c) => (
                    <label
                      key={c.id}
                      className={`flex min-h-11 items-center gap-3 rounded-md px-2 text-sm ${c.smart ? "opacity-60" : "cursor-pointer hover:bg-muted"}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--forest)]"
                        disabled={c.smart}
                        checked={form.collectionIds.includes(c.id)}
                        onChange={(e) =>
                          set(
                            "collectionIds",
                            e.target.checked
                              ? [...form.collectionIds, c.id]
                              : form.collectionIds.filter((id) => id !== c.id),
                          )
                        }
                      />
                      {c.title}
                      {c.smart ? (
                        <span className="text-xs text-muted-foreground">(automatic)</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            </Box>

            {product && canDelete ? (
              <Box title="Archive or delete">
                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    onClick={() => void setArchived(product.status !== "ARCHIVED")}
                  >
                    {product.status === "ARCHIVED" ? "Restore as draft" : "Archive product"}
                  </Button>
                  {confirmDelete ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-11 w-full"
                      onClick={() => void remove()}
                    >
                      Confirm: delete permanently
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete product
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Archiving keeps the product and its history. Deleting can&apos;t be undone.
                  </p>
                </div>
              </Box>
            ) : null}
          </aside>
        </div>
      </fieldset>
    </>
  );
}

function NewOptionForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (option: { name: string; values: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [valuesText, setValuesText] = useState("");
  const values = parseValues(valuesText);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-background p-3 ring-1 ring-border/60">
      <div>
        <label htmlFor="new-option-name" className="mb-1 block text-xs text-muted-foreground">
          New option name
        </label>
        <input
          id="new-option-name"
          className={`${field} w-44`}
          placeholder="Pot colour"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="new-option-values" className="mb-1 block text-xs text-muted-foreground">
          Values, separated by commas
        </label>
        <input
          id="new-option-values"
          className={`${field} w-64`}
          placeholder="Clay, Glazed"
          value={valuesText}
          onChange={(e) => setValuesText(e.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={busy || !name.trim() || values.length === 0}
        onClick={() =>
          void onAdd({ name: name.trim(), values }).then(() => {
            setName("");
            setValuesText("");
          })
        }
      >
        Add option
      </Button>
    </div>
  );
}

/** Loads what the form needs (the product when editing, and the shop's collections) and mounts it with real values. */
export default function ProductEditor({ numeric }: { numeric?: string }) {
  const product = useApiResource<{ product: ProductDetail }>(
    numeric ? `/api/admin/products/${numeric}` : null,
  );
  const collections = useApiResource<{ collections: CollectionOption[] }>(
    "/api/admin/shop/collections",
  );

  if ((numeric && product.status === "loading") || collections.status === "loading") {
    return (
      <>
        <PageHeader title={numeric ? "Product" : "New product"} />
        <Skeleton variant="form" />
      </>
    );
  }
  const failed =
    product.status === "error" ? product : collections.status === "error" ? collections : null;
  if (failed && failed.status === "error") {
    return (
      <>
        <PageHeader title={numeric ? "Product" : "New product"} />
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {failed.httpStatus === 404 ? "This product doesn't exist." : failed.message}{" "}
          <button
            className="underline"
            onClick={() => {
              product.retry();
              collections.retry();
            }}
          >
            Try again
          </button>
        </div>
      </>
    );
  }
  const detail = numeric && product.status === "ready" ? product.data.product : null;
  const options = collections.status === "ready" ? collections.data.collections : [];
  return <Editor key={detail?.id ?? "new"} initial={detail} collections={options} />;
}
