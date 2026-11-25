"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import MediaPicker from "@/components/admin/media/MediaPicker";
import DesignPicker from "@/components/admin/campaigns/DesignPicker";
import PageHeader from "@/components/admin/PageHeader";
import Skeleton from "@/components/admin/Skeleton";
import StatusPill from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { MediaView } from "@/lib/blog-types";
import { campaignInputSchema, type CampaignContent, type CampaignDetail } from "@/lib/campaigns";
import { DEFAULT_DESIGN } from "@/lib/email-designs";
import { formatDateTime, statusLabel } from "@/lib/order-format";
import { useAppSelector } from "@/store/hooks";

const field =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";
const area =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message : "Network problem. Check your connection and try again.";

type Form = {
  name: string;
  subject: string;
  preheader: string;
  design: string;
  content: CampaignContent;
};

const blank = (): Form => ({
  name: "",
  subject: "",
  preheader: "",
  design: DEFAULT_DESIGN,
  content: { eyebrow: "", heading: "", paragraphs: [""], image: null, cta: null, signoff: "" },
});

const formOf = (c: CampaignDetail): Form => ({
  name: c.name,
  subject: c.subject,
  preheader: c.preheader,
  design: c.design,
  content: c.content,
});

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-border/60">
      <h2 className="mb-3 font-display text-lg text-forest">{title}</h2>
      {children}
    </section>
  );
}

function Editor({ initial }: { initial: CampaignDetail | null }) {
  const router = useRouter();
  const permissions = useAppSelector((s) => s.admin.access?.permissions ?? []);
  const canWrite = permissions.includes("campaigns:write");
  const canSend = permissions.includes("campaigns:send");
  const [campaign, setCampaign] = useState(initial);
  const [form, setForm] = useState<Form>(() => (initial ? formOf(initial) : blank()));
  const [saved, setSaved] = useState(() => JSON.stringify(initial ? formOf(initial) : blank()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [when, setWhen] = useState("");
  // The earliest allowed time, fixed when the editor opens (the server enforces the real minimum).
  const [minLocal] = useState(() =>
    new Date(Date.now() + 5 * 60_000 - new Date().getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16),
  );
  const audience = useApiResource<{ subscribers: number }>("/api/admin/campaigns/audience");

  const locked = campaign !== null && (campaign.status === "sending" || campaign.status === "sent");
  const dirty = JSON.stringify(form) !== saved;
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setContent = (patch: Partial<CampaignContent>) =>
    setForm((f) => ({ ...f, content: { ...f.content, ...patch } }));

  // Live preview: re-rendered by the server shortly after the last change, from the same code that sends the email.
  // Nothing is requested until there is a heading and some text, because the server renders only a complete message.
  const complete =
    form.content.heading.trim() !== "" && form.content.paragraphs.some((p) => p.trim() !== "");
  useEffect(() => {
    if (!complete) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch<{ html: string }>("/api/admin/campaigns/preview", {
        method: "POST",
        json: {
          design: form.design,
          subject: form.subject || undefined,
          preheader: form.preheader,
          content: {
            ...form.content,
            paragraphs: form.content.paragraphs.map((p) => p.trim()).filter(Boolean),
            cta:
              form.content.cta?.label.trim() && form.content.cta.url.trim()
                ? form.content.cta
                : null,
          },
        },
      })
        .then((r) => {
          if (cancelled) return;
          setHtml(r.html);
          setPreviewError(false);
        })
        .catch(() => {
          if (!cancelled) setPreviewError(true);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [complete, form.design, form.subject, form.preheader, form.content]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const adopt = (c: CampaignDetail, message?: string) => {
    setCampaign(c);
    const next = formOf(c);
    setForm(next);
    setSaved(JSON.stringify(next));
    if (message) setNotice(message);
  };

  const payload = () => {
    const content: CampaignContent = {
      ...form.content,
      paragraphs: form.content.paragraphs.map((p) => p.trim()).filter(Boolean),
      cta:
        form.content.cta && form.content.cta.label.trim() && form.content.cta.url.trim()
          ? form.content.cta
          : null,
    };
    return { ...form, content };
  };

  const save = () =>
    act(async () => {
      const body = payload();
      const parsed = campaignInputSchema.safeParse(body);
      if (!parsed.success) {
        setError(
          parsed.error.issues
            .slice(0, 3)
            .map((i) => i.message)
            .join(" "),
        );
        return;
      }
      if (!campaign) {
        const { campaign: made } = await apiFetch<{ campaign: CampaignDetail }>(
          "/api/admin/campaigns",
          { method: "POST", json: body },
        );
        setSaved(JSON.stringify(form));
        router.replace(`/admin/marketing/campaigns/${made.id}`);
        return;
      }
      const { campaign: next } = await apiFetch<{ campaign: CampaignDetail }>(
        `/api/admin/campaigns/${campaign.id}`,
        { method: "PUT", json: body },
      );
      adopt(next, "Saved.");
    });

  const call = (path: string, method: "POST" | "DELETE", json: unknown, message: string) =>
    act(async () => {
      if (!campaign) return;
      const { campaign: next } = await apiFetch<{ campaign: CampaignDetail }>(
        `/api/admin/campaigns/${campaign.id}${path}`,
        { method, json },
      );
      adopt(next, message);
      setConfirmSend(false);
    });

  const sendTest = () =>
    act(async () => {
      if (!campaign) return;
      const r = await apiFetch<{ sentTo: string }>(`/api/admin/campaigns/${campaign.id}/test`, {
        method: "POST",
      });
      setNotice(`A test was sent to ${r.sentTo}. It should arrive within a minute.`);
    });

  const remove = () =>
    act(async () => {
      if (!campaign) return;
      await apiFetch(`/api/admin/campaigns/${campaign.id}`, { method: "DELETE" });
      router.push("/admin/marketing/campaigns");
    });

  const subscribers = audience.status === "ready" ? audience.data.subscribers : null;
  return (
    <>
      <PageHeader
        title={campaign ? campaign.name : "New campaign"}
        lead={campaign ? undefined : "Write the message, pick a design, then test it and send it."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {campaign ? (
              <StatusPill
                label={statusLabel(campaign.status)}
                tone={
                  campaign.status === "sent"
                    ? "good"
                    : campaign.status === "draft"
                      ? "neutral"
                      : "warn"
                }
              />
            ) : null}
            <Button asChild variant="outline" className="h-11">
              <Link href="/admin/marketing/campaigns">All campaigns</Link>
            </Button>
          </div>
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

      {campaign?.stats ? (
        <section aria-label="Results" className="mb-6 rounded-xl bg-card p-5 ring-1 ring-border/60">
          <h2 className="mb-3 font-display text-lg text-forest">Results</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {(
              [
                ["Queued", campaign.stats.queued],
                ["Delivered", campaign.stats.delivered],
                ["Waiting", campaign.stats.pending],
                ["Failed", campaign.stats.failed],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-display text-2xl text-forest tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Opens and clicks aren&apos;t tracked: that needs an email-sending service with tracking,
            which isn&apos;t connected yet, so no figure is shown rather than a made-up one.
          </p>
        </section>
      ) : null}

      <fieldset disabled={busy || locked || !canWrite} className="min-w-0 border-0 p-0">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div className="min-w-0 space-y-6">
            <Box title="Campaign">
              <div className="space-y-4">
                <div>
                  <label htmlFor="c-name" className="mb-1.5 block text-sm font-medium">
                    Name (only you see this)
                  </label>
                  <input
                    id="c-name"
                    className={field}
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="c-subject" className="mb-1.5 block text-sm font-medium">
                    Subject line
                  </label>
                  <input
                    id="c-subject"
                    className={field}
                    maxLength={150}
                    value={form.subject}
                    onChange={(e) => set("subject", e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="c-pre" className="mb-1.5 block text-sm font-medium">
                    Preview text (shown after the subject in the inbox)
                  </label>
                  <input
                    id="c-pre"
                    className={field}
                    maxLength={200}
                    value={form.preheader}
                    onChange={(e) => set("preheader", e.target.value)}
                  />
                </div>
              </div>
            </Box>

            <Box title="Design">
              <DesignPicker value={form.design} onChange={(id) => set("design", id)} />
            </Box>

            <Box title="Message">
              <div className="space-y-4">
                <div>
                  <label htmlFor="c-eyebrow" className="mb-1.5 block text-sm font-medium">
                    Small line above the heading (optional)
                  </label>
                  <input
                    id="c-eyebrow"
                    className={field}
                    maxLength={60}
                    value={form.content.eyebrow}
                    onChange={(e) => setContent({ eyebrow: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="c-heading" className="mb-1.5 block text-sm font-medium">
                    Heading
                  </label>
                  <input
                    id="c-heading"
                    className={field}
                    maxLength={150}
                    value={form.content.heading}
                    onChange={(e) => setContent({ heading: e.target.value })}
                  />
                </div>
                <fieldset className="space-y-2">
                  <legend className="mb-1.5 text-sm font-medium">
                    Text (one paragraph per box)
                  </legend>
                  {form.content.paragraphs.map((text, i) => (
                    <div key={i} className="flex gap-2">
                      <label htmlFor={`c-p-${i}`} className="sr-only">
                        Paragraph {i + 1}
                      </label>
                      <textarea
                        id={`c-p-${i}`}
                        rows={3}
                        className={area}
                        maxLength={2000}
                        value={text}
                        onChange={(e) =>
                          setContent({
                            paragraphs: form.content.paragraphs.map((t, j) =>
                              j === i ? e.target.value : t,
                            ),
                          })
                        }
                      />
                      {form.content.paragraphs.length > 1 ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11"
                          onClick={() =>
                            setContent({
                              paragraphs: form.content.paragraphs.filter((_, j) => j !== i),
                            })
                          }
                        >
                          Remove<span className="sr-only"> paragraph {i + 1}</span>
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {form.content.paragraphs.length < 12 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => setContent({ paragraphs: [...form.content.paragraphs, ""] })}
                    >
                      Add paragraph
                    </Button>
                  ) : null}
                </fieldset>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium">Picture (optional)</legend>
                  {form.content.image ? (
                    <div className="mb-2 flex items-start gap-3">
                      <Image
                        src={form.content.image.src}
                        alt=""
                        width={160}
                        height={120}
                        sizes="160px"
                        className="h-20 w-28 rounded-md bg-sand object-cover"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <label htmlFor="c-alt" className="block text-xs text-muted-foreground">
                          Picture description
                        </label>
                        <input
                          id="c-alt"
                          className={field}
                          maxLength={200}
                          value={form.content.image.alt}
                          onChange={(e) =>
                            form.content.image &&
                            setContent({ image: { ...form.content.image, alt: e.target.value } })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11"
                          onClick={() => setContent({ image: null })}
                        >
                          Remove picture
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => setPicking(true)}
                  >
                    {form.content.image ? "Change picture" : "Choose from media library"}
                  </Button>
                  <MediaPicker
                    open={picking}
                    onOpenChange={setPicking}
                    onPick={(m: MediaView) => {
                      setContent({ image: { src: m.url, alt: m.alt } });
                      setPicking(false);
                    }}
                  />
                </fieldset>
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="mb-1.5 text-sm font-medium">Button (optional)</legend>
                  <div>
                    <label
                      htmlFor="c-cta-label"
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      Button text
                    </label>
                    <input
                      id="c-cta-label"
                      className={field}
                      maxLength={60}
                      value={form.content.cta?.label ?? ""}
                      onChange={(e) =>
                        setContent({
                          cta: { label: e.target.value, url: form.content.cta?.url ?? "" },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="c-cta-url" className="mb-1 block text-xs text-muted-foreground">
                      Goes to (https://…)
                    </label>
                    <input
                      id="c-cta-url"
                      className={field}
                      inputMode="url"
                      value={form.content.cta?.url ?? ""}
                      onChange={(e) =>
                        setContent({
                          cta: { label: form.content.cta?.label ?? "", url: e.target.value },
                        })
                      }
                    />
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="c-sign" className="mb-1.5 block text-sm font-medium">
                    Sign-off (optional)
                  </label>
                  <input
                    id="c-sign"
                    className={field}
                    maxLength={120}
                    value={form.content.signoff}
                    onChange={(e) => setContent({ signoff: e.target.value })}
                  />
                </div>
              </div>
            </Box>
          </div>

          <div className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Box title="Preview">
              {!complete ? (
                <p className="text-sm text-muted-foreground">
                  Add a heading and some text to see the preview.
                </p>
              ) : html ? (
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={html}
                  className="h-[34rem] w-full rounded-md border border-border bg-white"
                />
              ) : (
                <Skeleton variant="grid" rows={2} />
              )}
              {previewError ? (
                <p className="mt-2 text-xs text-destructive">
                  The preview couldn&apos;t refresh. Your last change may not be shown.
                </p>
              ) : null}
            </Box>

            <Box title="Save and send">
              <div className="space-y-3">
                {canWrite && !locked ? (
                  <Button
                    className="h-11 w-full"
                    disabled={busy || (!!campaign && !dirty)}
                    onClick={() => void save()}
                  >
                    {busy ? "Saving…" : campaign ? "Save changes" : "Create campaign"}
                  </Button>
                ) : null}
                {campaign && canWrite && !locked ? (
                  <Button
                    variant="outline"
                    className="h-11 w-full"
                    disabled={busy || dirty}
                    onClick={() => void sendTest()}
                  >
                    Send a test to me
                  </Button>
                ) : null}
                {dirty && campaign ? (
                  <p className="text-xs text-muted-foreground">
                    Save your changes first: tests and sends use the saved version.
                  </p>
                ) : null}

                {campaign && canSend && !locked && !dirty ? (
                  <div className="space-y-3 border-t border-border pt-3">
                    <p className="text-sm text-muted-foreground">
                      {subscribers === null
                        ? "Checking the audience…"
                        : subscribers === 0
                          ? "There are no confirmed subscribers yet."
                          : `It will go to ${subscribers} confirmed ${subscribers === 1 ? "subscriber" : "subscribers"}.`}
                    </p>
                    {confirmSend ? (
                      <Button
                        variant="destructive"
                        className="h-11 w-full"
                        disabled={busy || !subscribers}
                        onClick={() =>
                          void call(
                            "/send",
                            "POST",
                            undefined,
                            "Sent. The emails are being delivered now.",
                          )
                        }
                      >
                        Confirm: send to {subscribers} {subscribers === 1 ? "person" : "people"} now
                      </Button>
                    ) : (
                      <Button
                        className="h-11 w-full"
                        disabled={busy || !subscribers}
                        onClick={() => setConfirmSend(true)}
                      >
                        Send now
                      </Button>
                    )}
                    <div>
                      <label htmlFor="c-when" className="mb-1 block text-xs text-muted-foreground">
                        Or schedule it (your local time)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="c-when"
                          type="datetime-local"
                          min={minLocal}
                          className={field}
                          value={when}
                          onChange={(e) => setWhen(e.target.value)}
                        />
                        <Button
                          variant="outline"
                          className="h-11"
                          disabled={busy || !when || !subscribers}
                          onClick={() =>
                            void call(
                              "/schedule",
                              "POST",
                              { at: new Date(when).toISOString() },
                              "Scheduled.",
                            )
                          }
                        >
                          Schedule
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {campaign?.status === "scheduled" && campaign.scheduledAt ? (
                  <div className="space-y-2 border-t border-border pt-3 text-sm">
                    <p>Goes out {formatDateTime(campaign.scheduledAt)}.</p>
                    <p className="text-xs text-muted-foreground">
                      Scheduled sends are picked up by the background job, which runs about once a
                      day on the free hosting plan (every few minutes on Docker or a paid plan). It
                      can go out later than the time you set.
                    </p>
                    {canSend ? (
                      <Button
                        variant="outline"
                        className="h-11 w-full"
                        disabled={busy}
                        onClick={() =>
                          void call(
                            "/schedule",
                            "DELETE",
                            undefined,
                            "Unscheduled. It is a draft again.",
                          )
                        }
                      >
                        Unschedule
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {campaign?.status === "sending" ? (
                  <p className="text-sm">
                    Sending… this page can be closed; a send that was interrupted is resumed
                    automatically.
                  </p>
                ) : null}
                {campaign?.status === "sent" && campaign.sentAt ? (
                  <p className="text-sm">
                    Sent {formatDateTime(campaign.sentAt)}. A sent campaign is kept as a record and
                    can&apos;t be changed.
                  </p>
                ) : null}
                {campaign && canWrite && !locked ? (
                  <Button
                    variant="outline"
                    className="h-11 w-full"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    Delete campaign
                  </Button>
                ) : null}
              </div>
            </Box>
          </div>
        </div>
      </fieldset>
    </>
  );
}

export default function CampaignEditor({ id }: { id?: string }) {
  const resource = useApiResource<{ campaign: CampaignDetail }>(
    id ? `/api/admin/campaigns/${id}` : null,
  );
  if (id && resource.status === "loading")
    return (
      <>
        <PageHeader title="Campaign" />
        <Skeleton variant="form" />
      </>
    );
  if (id && resource.status === "error") {
    return (
      <>
        <PageHeader title="Campaign" />
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {resource.httpStatus === 404 ? "This campaign doesn't exist." : resource.message}{" "}
          <button className="underline" onClick={resource.retry}>
            Try again
          </button>
        </p>
      </>
    );
  }
  return (
    <Editor
      key={id ?? "new"}
      initial={id && resource.status === "ready" ? resource.data.campaign : null}
    />
  );
}
