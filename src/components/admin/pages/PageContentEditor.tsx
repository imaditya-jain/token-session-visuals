"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import MediaPicker from "@/components/admin/media/MediaPicker";
import PageHeader from "@/components/admin/PageHeader";
import Skeleton from "@/components/admin/Skeleton";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { MediaView } from "@/lib/blog-types";
import {
  pageDef,
  type CardValue,
  type FaqGroup,
  type FieldDef,
  type FieldValue,
  type ImageValue,
  type LinkValue,
  type PageValues,
  type QuoteValue,
} from "@/lib/page-content";
import type { RichDoc } from "@/lib/rich-text/types";
import type { EditorDoc } from "@/lib/page-content-core";
import { useAppSelector } from "@/store/hooks";

type AdminPage = {
  id: string;
  draft: PageValues;
  published: PageValues;
  publishedAt: string | null;
  hasUnpublished: boolean;
};

const RichTextEditor = dynamic(() => import("@/components/admin/blog/RichTextEditor"), {
  ssr: false,
  loading: () => <Skeleton variant="list" rows={3} />,
});

const field =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const area =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message : "Network problem. Check your connection and try again.";

const previewSrc = (src: string): string => src;

function FieldEditor({
  id,
  def,
  value,
  onChange,
  pick,
}: {
  id: string;
  def: FieldDef;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  pick: (done: (m: MediaView) => void) => void;
}) {
  switch (def.kind) {
    case "text":
      return (
        <div>
          <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
            {def.label}
          </label>
          <input
            id={id}
            className={field}
            maxLength={def.max}
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "textarea":
      return (
        <div>
          <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
            {def.label}
          </label>
          <textarea
            id={id}
            rows={3}
            className={area}
            maxLength={def.max}
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "link": {
      const v = value as LinkValue;
      return (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1.5 text-sm font-medium">{def.label}</legend>
          <div>
            <label htmlFor={`${id}-label`} className="mb-1 block text-xs text-muted-foreground">
              Button text
            </label>
            <input
              id={`${id}-label`}
              className={field}
              maxLength={60}
              value={v.label}
              onChange={(e) => onChange({ ...v, label: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-href`} className="mb-1 block text-xs text-muted-foreground">
              Goes to (/page, #section or https://…)
            </label>
            <input
              id={`${id}-href`}
              className={field}
              value={v.href}
              onChange={(e) => onChange({ ...v, href: e.target.value })}
            />
          </div>
        </fieldset>
      );
    }
    case "image": {
      const v = value as ImageValue;
      return (
        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-sm font-medium">{def.label}</legend>
          <div className="flex flex-wrap items-start gap-4">
            <Image
              src={previewSrc(v.src)}
              alt=""
              width={160}
              height={120}
              sizes="160px"
              className="h-24 w-32 rounded-md bg-sand object-cover"
            />
            <div className="min-w-56 flex-1 space-y-3">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => pick((m) => onChange({ src: m.url, alt: v.alt || m.alt }))}
              >
                Choose from media library
              </Button>
              <div>
                <label htmlFor={`${id}-alt`} className="mb-1 block text-xs text-muted-foreground">
                  Picture description (for screen readers)
                </label>
                <input
                  id={`${id}-alt`}
                  className={field}
                  maxLength={200}
                  value={v.alt}
                  onChange={(e) => onChange({ ...v, alt: e.target.value })}
                />
              </div>
            </div>
          </div>
        </fieldset>
      );
    }
    case "list": {
      const v = value as string[];
      return (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium">{def.label}</legend>
          {v.map((item, i) => (
            <div key={i} className="flex gap-2">
              <label htmlFor={`${id}-${i}`} className="sr-only">
                {def.label} {i + 1}
              </label>
              <input
                id={`${id}-${i}`}
                className={field}
                maxLength={def.itemMax}
                value={item}
                onChange={(e) => onChange(v.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => onChange(v.filter((_, j) => j !== i))}
              >
                Remove
                <span className="sr-only">
                  {" "}
                  {def.label} {i + 1}
                </span>
              </Button>
            </div>
          ))}
          {v.length < def.maxItems ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onChange([...v, ""])}
            >
              Add
            </Button>
          ) : null}
        </fieldset>
      );
    }
    case "cards": {
      const v = value as CardValue[];
      return (
        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-sm font-medium">{def.label}</legend>
          {v.map((card, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-background p-3 ring-1 ring-border/60">
              <label htmlFor={`${id}-${i}-t`} className="block text-xs text-muted-foreground">
                Title {i + 1}
              </label>
              <input
                id={`${id}-${i}-t`}
                className={field}
                maxLength={80}
                value={card.title}
                onChange={(e) =>
                  onChange(v.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                }
              />
              <label htmlFor={`${id}-${i}-x`} className="block text-xs text-muted-foreground">
                Text {i + 1}
              </label>
              <textarea
                id={`${id}-${i}-x`}
                rows={2}
                className={area}
                maxLength={300}
                value={card.text}
                onChange={(e) =>
                  onChange(v.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                }
              />
              {v.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => onChange(v.filter((_, j) => j !== i))}
                >
                  Remove item {i + 1}
                </Button>
              ) : null}
            </div>
          ))}
          {v.length < def.maxItems ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onChange([...v, { title: "", text: "" }])}
            >
              Add item
            </Button>
          ) : null}
        </fieldset>
      );
    }
    case "richtext":
      return (
        <div>
          <p className="mb-1.5 text-sm font-medium">{def.label}</p>
          <RichTextEditor
            initial={value as unknown as RichDoc}
            onChange={(d) => onChange(d as unknown as EditorDoc)}
          />
        </div>
      );
    case "faqs": {
      const v = value as FaqGroup[];
      const setGroup = (gi: number, group: FaqGroup) =>
        onChange(v.map((g, j) => (j === gi ? group : g)));
      return (
        <fieldset className="space-y-4">
          <legend className="mb-1.5 text-sm font-medium">{def.label}</legend>
          <p className="text-xs text-muted-foreground">
            In an answer, write **bold** and [link text](/page) for links.
          </p>
          {v.map((group, gi) => (
            <div key={gi} className="space-y-3 rounded-lg bg-background p-3 ring-1 ring-border/60">
              <label htmlFor={`${id}-${gi}-g`} className="block text-xs text-muted-foreground">
                Group title {gi + 1}
              </label>
              <input
                id={`${id}-${gi}-g`}
                className={field}
                maxLength={80}
                value={group.title}
                onChange={(e) => setGroup(gi, { ...group, title: e.target.value })}
              />
              {group.items.map((item, ii) => (
                <div key={ii} className="space-y-2 border-l-2 border-sage pl-3">
                  <label
                    htmlFor={`${id}-${gi}-${ii}-q`}
                    className="block text-xs text-muted-foreground"
                  >
                    Question {gi + 1}.{ii + 1}
                  </label>
                  <input
                    id={`${id}-${gi}-${ii}-q`}
                    className={field}
                    maxLength={200}
                    value={item.question}
                    onChange={(e) =>
                      setGroup(gi, {
                        ...group,
                        items: group.items.map((x, k) =>
                          k === ii ? { ...x, question: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <label
                    htmlFor={`${id}-${gi}-${ii}-a`}
                    className="block text-xs text-muted-foreground"
                  >
                    Answer {gi + 1}.{ii + 1}
                  </label>
                  <textarea
                    id={`${id}-${gi}-${ii}-a`}
                    rows={3}
                    className={area}
                    maxLength={1200}
                    value={item.answer}
                    onChange={(e) =>
                      setGroup(gi, {
                        ...group,
                        items: group.items.map((x, k) =>
                          k === ii ? { ...x, answer: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  {group.items.length > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() =>
                        setGroup(gi, { ...group, items: group.items.filter((_, k) => k !== ii) })
                      }
                    >
                      Remove question {gi + 1}.{ii + 1}
                    </Button>
                  ) : null}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {group.items.length < 20 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() =>
                      setGroup(gi, {
                        ...group,
                        items: [...group.items, { question: "", answer: "" }],
                      })
                    }
                  >
                    Add question to group {gi + 1}
                  </Button>
                ) : null}
                {v.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => onChange(v.filter((_, j) => j !== gi))}
                  >
                    Remove group {gi + 1}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {v.length < def.maxGroups ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onChange([...v, { title: "", items: [{ question: "", answer: "" }] }])}
            >
              Add group
            </Button>
          ) : null}
        </fieldset>
      );
    }
    case "quotes": {
      const v = value as QuoteValue[];
      return (
        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-sm font-medium">{def.label}</legend>
          {v.map((q, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-background p-3 ring-1 ring-border/60">
              <label htmlFor={`${id}-${i}-q`} className="block text-xs text-muted-foreground">
                Quote {i + 1}
              </label>
              <textarea
                id={`${id}-${i}-q`}
                rows={3}
                className={area}
                maxLength={400}
                value={q.quote}
                onChange={(e) =>
                  onChange(v.map((x, j) => (j === i ? { ...x, quote: e.target.value } : x)))
                }
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`${id}-${i}-n`}
                    className="mb-1 block text-xs text-muted-foreground"
                  >
                    Name {i + 1}
                  </label>
                  <input
                    id={`${id}-${i}-n`}
                    className={field}
                    maxLength={60}
                    value={q.name}
                    onChange={(e) =>
                      onChange(v.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${id}-${i}-l`}
                    className="mb-1 block text-xs text-muted-foreground"
                  >
                    Place {i + 1}
                  </label>
                  <input
                    id={`${id}-${i}-l`}
                    className={field}
                    maxLength={60}
                    value={q.location}
                    onChange={(e) =>
                      onChange(v.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)))
                    }
                  />
                </div>
              </div>
              {v.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => onChange(v.filter((_, j) => j !== i))}
                >
                  Remove quote {i + 1}
                </Button>
              ) : null}
            </div>
          ))}
          {v.length < def.maxItems ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onChange([...v, { quote: "", name: "", location: "" }])}
            >
              Add quote
            </Button>
          ) : null}
        </fieldset>
      );
    }
  }
}

function Editor({ pageId, initial }: { pageId: string; initial: AdminPage }) {
  const page = pageDef(pageId);
  const canPublish = useAppSelector(
    (s) => s.admin.access?.permissions.includes("site:publish") ?? false,
  );
  const [state, setState] = useState(initial);
  const [values, setValues] = useState<PageValues>(initial.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<((m: MediaView) => void) | null>(null);
  const [open, setOpen] = useState<string>(page?.sections[0]?.id ?? "");

  if (!page) return null;
  const dirty = JSON.stringify(values) !== JSON.stringify(state.draft);

  const call = async (
    path: string,
    method: "PUT" | "POST",
    json: unknown,
    message: string,
    adopt = true,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await apiFetch<AdminPage>(`/api/admin/pages/${pageId}${path}`, { method, json });
      setState(next);
      if (adopt) setValues(next.draft);
      setNotice(message);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const setField = (section: string, fieldId: string, value: FieldValue) =>
    setValues((v) => ({ ...v, [section]: { ...v[section], [fieldId]: value } }));

  return (
    <>
      <PageHeader
        title={page.title}
        lead="Changes are saved as a draft. Publish to show them on the website."
        action={
          <Button asChild variant="outline" className="h-11">
            <Link href="/admin/site/pages">All pages</Link>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          {page.sections.map((section) => {
            const expanded = open === section.id;
            return (
              <section key={section.id} className="rounded-xl bg-card ring-1 ring-border/60">
                <h2>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`panel-${section.id}`}
                    onClick={() => setOpen(expanded ? "" : section.id)}
                    className="flex min-h-14 w-full items-center justify-between px-5 text-left font-display text-lg text-forest"
                  >
                    {section.label}
                    <span aria-hidden>{expanded ? "−" : "+"}</span>
                  </button>
                </h2>
                {expanded ? (
                  <fieldset
                    id={`panel-${section.id}`}
                    disabled={busy}
                    className="min-w-0 space-y-5 border-0 px-5 pb-5 pt-1"
                  >
                    {Object.entries(section.fields).map(([fieldId, def]) => (
                      <FieldEditor
                        key={fieldId}
                        id={`f-${section.id}-${fieldId}`}
                        def={def}
                        value={values[section.id]?.[fieldId] ?? def.default}
                        onChange={(v) => setField(section.id, fieldId, v)}
                        pick={(done) => setPicker(() => done)}
                      />
                    ))}
                  </fieldset>
                ) : null}
              </section>
            );
          })}
        </div>
        <aside
          aria-label="Save and publish"
          className="space-y-3 self-start rounded-xl bg-card p-5 ring-1 ring-border/60 lg:sticky lg:top-6"
        >
          <Button
            className="h-11 w-full"
            disabled={busy || !dirty}
            onClick={() => void call("", "PUT", values, "Draft saved.")}
          >
            {busy ? "Saving…" : "Save draft"}
          </Button>
          {canPublish ? (
            <Button
              variant="outline"
              className="h-11 w-full"
              disabled={busy || (!dirty && !state.hasUnpublished)}
              onClick={() =>
                void (async () => {
                  if (dirty) await call("", "PUT", values, "Draft saved.", false);
                  await call(
                    "/publish",
                    "POST",
                    undefined,
                    "Published. The website now shows these changes.",
                  );
                })()
              }
            >
              Publish to website
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={busy || (!dirty && !state.hasUnpublished)}
            onClick={() => void call("/discard", "POST", undefined, "Changes discarded.")}
          >
            Discard changes
          </Button>
          <p className="text-xs text-muted-foreground">
            {dirty
              ? "You have unsaved edits."
              : state.hasUnpublished
                ? "Saved, not yet published."
                : "Matches the website."}
          </p>
          <Link
            href={page.path}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm underline"
          >
            View the page<span className="sr-only"> (opens in a new tab)</span>
          </Link>
        </aside>
      </div>
      <MediaPicker
        open={picker !== null}
        onOpenChange={(o) => {
          if (!o) setPicker(null);
        }}
        onPick={(m) => {
          picker?.(m);
          setPicker(null);
        }}
      />
    </>
  );
}

export default function PageContentEditor({ pageId }: { pageId: string }) {
  const resource = useApiResource<AdminPage>(`/api/admin/pages/${pageId}`);
  if (resource.status === "loading")
    return (
      <>
        <PageHeader title="Page content" />
        <Skeleton variant="form" />
      </>
    );
  if (resource.status === "error") {
    return (
      <>
        <PageHeader title="Page content" />
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {resource.httpStatus === 404 ? "That page isn't editable." : resource.message}{" "}
          <button className="underline" onClick={resource.retry}>
            Try again
          </button>
        </p>
      </>
    );
  }
  return <Editor pageId={pageId} initial={resource.data} />;
}
