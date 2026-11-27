"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  HeartPulse,
  ImagePlus,
  Leaf,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import ProductCard from "@/components/storefront/ProductCard";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  type Diagnosis,
  type DiagnosisRecord,
  type DiagnosisSummary,
  type HealthLevel,
  MAX_NOTES_LENGTH,
  PLANT_DOCTOR_DISCLAIMER,
} from "@/lib/plant-doctor";
import { shrinkImage } from "@/lib/shrink-image";
import { useAppSelector } from "@/store/hooks";

const HEALTH: Record<HealthLevel, { label: string; tone: string; icon: typeof HeartPulse }> = {
  healthy: { label: "Looking healthy", tone: "bg-sage-light text-forest", icon: CheckCircle2 },
  minor_issues: { label: "Minor issues", tone: "bg-sand text-forest", icon: Leaf },
  needs_attention: {
    label: "Needs attention",
    tone: "bg-clay/15 text-clay-deep",
    icon: HeartPulse,
  },
  urgent: {
    label: "Needs help soon",
    tone: "bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
  unclear: { label: "Can't tell yet", tone: "bg-muted text-muted-foreground", icon: ImagePlus },
};

const MESSAGES = [
  "Looking at the leaves…",
  "Checking colour and texture…",
  "Thinking about light and water…",
  "Looking for pests and disease…",
  "Putting your care plan together…",
];

const ERROR_TEXT: Record<string, string> = {
  rate_limited: "You've reached today's limit of plant checks. Please come back tomorrow.",
  plant_doctor_busy: "The Plant Doctor is very busy today. Please try again tomorrow.",
  plant_doctor_not_configured: "The Plant Doctor isn't switched on yet. Please check back soon.",
  unsupported_image: "Please use a JPEG, PNG or WebP photo.",
  image_too_small: "That photo is too small to see the leaves. Try a closer, larger photo.",
  unreadable_image: "We couldn't read that photo. Try taking it again.",
};

const friendly = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 429) return ERROR_TEXT["rate_limited"] ?? error.message;
    return ERROR_TEXT[error.code] ?? error.message;
  }
  return "Something went wrong. Please check your connection and try again.";
};

const SEVERITY: Record<string, string> = {
  mild: "bg-sage-light text-forest",
  moderate: "bg-clay/15 text-clay-deep",
  severe: "bg-destructive/10 text-destructive",
};

function Steps({ title, items, icon }: { title: string; items: string[]; icon?: "check" | "x" }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
      <h4 className="font-display text-lg font-medium text-forest">{title}</h4>
      <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-foreground/90">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span
              aria-hidden
              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${icon === "x" ? "bg-destructive/70" : "bg-clay"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Result({ record, onAgain }: { record: DiagnosisRecord; onAgain: () => void }) {
  const d: Diagnosis = record.diagnosis;
  const health = HEALTH[d.health];
  const HealthIcon = health.icon;
  return (
    <div className="animate-rise space-y-8" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Your plant</p>
          <h2 className="mt-1 font-display text-3xl font-medium text-forest sm:text-4xl">
            {d.plant?.commonName ?? "We couldn't identify it"}
          </h2>
          {d.plant?.scientificName ? (
            <p className="mt-1 text-sm italic text-muted-foreground">
              {d.plant.scientificName}
              {d.plant.confidence === "low" ? " (not sure)" : ""}
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${health.tone}`}
        >
          <HealthIcon className="size-4" aria-hidden />
          {health.label}
        </span>
      </div>

      {d.photoIssue ? (
        <p className="rounded-2xl bg-sand p-5 text-sm leading-relaxed text-foreground/90">
          {d.photoIssue}
        </p>
      ) : null}
      <p className="text-lg leading-relaxed text-foreground/90">{d.summary}</p>

      {d.findings.length > 0 ? (
        <section aria-labelledby="pd-findings" className="space-y-3">
          <h3 id="pd-findings" className="font-display text-2xl font-medium text-forest">
            What we can see
          </h3>
          {d.findings.map((finding, index) => (
            <details
              key={finding.title}
              open={index === 0}
              className="group rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="font-display text-lg font-medium text-forest">
                  {finding.title}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${SEVERITY[finding.severity] ?? ""}`}
                  >
                    {finding.severity}
                  </span>
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">{finding.evidence}</p>
              {finding.likelyCauses.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {finding.likelyCauses.map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">
                Confidence: {finding.confidence}
              </p>
            </details>
          ))}
        </section>
      ) : null}

      {d.carePlan.rightNow.length + d.carePlan.thisWeek.length + d.carePlan.ongoing.length > 0 ? (
        <section aria-labelledby="pd-plan" className="space-y-4">
          <h3 id="pd-plan" className="font-display text-2xl font-medium text-forest">
            Your care plan
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Steps title="Right now" items={d.carePlan.rightNow} />
            <Steps title="This week" items={d.carePlan.thisWeek} />
            <Steps title="Keep doing" items={d.carePlan.ongoing} />
            <Steps title="Avoid" items={d.carePlan.avoid} icon="x" />
          </div>
        </section>
      ) : null}

      {d.watchFor.length > 0 ? <Steps title="Watch for" items={d.watchFor} /> : null}
      {d.questions.length > 0 ? <Steps title="Helpful to know" items={d.questions} /> : null}
      {d.whenToGetHelp ? (
        <p className="flex gap-3 rounded-2xl bg-clay/10 p-5 text-sm leading-relaxed text-foreground/90">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-clay" aria-hidden />
          {d.whenToGetHelp}
        </p>
      ) : null}

      {d.research && (d.research.tips.length > 0 || d.research.treatments.length > 0) ? (
        <section aria-labelledby="pd-research" className="space-y-4">
          <h3 id="pd-research" className="font-display text-2xl font-medium text-forest">
            From the web: care tips and treatments
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Steps title="Tips for this problem" items={d.research.tips} />
            {d.research.treatments.length > 0 ? (
              <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
                <h4 className="font-display text-lg font-medium text-forest">
                  Treatments gardeners use
                </h4>
                <ul className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
                  {d.research.treatments.map((t) => (
                    <li key={t.name}>
                      <p className="font-semibold text-forest">{t.name}</p>
                      <p>{t.about}</p>
                      <p className="text-muted-foreground">{t.safety}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          {d.research.sources.length > 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Sources:{" "}
              {d.research.sources.map((source, index) => (
                <span key={source.url}>
                  {index > 0 ? " · " : ""}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {source.title}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </section>
      ) : null}

      {d.products.length > 0 ? (
        <section aria-labelledby="pd-products" className="space-y-4">
          <h3 id="pd-products" className="font-display text-2xl font-medium text-forest">
            From our shop, for this plan
          </h3>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {d.products.map(({ product, reason }) => (
              <li key={product.id} className="flex flex-col gap-2">
                <ProductCard product={product} />
                <p className="px-1 text-sm leading-snug text-muted-foreground">{reason}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="flex gap-3 rounded-2xl bg-sage-light/60 p-5 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden />
        {PLANT_DOCTOR_DISCLAIMER}
      </p>

      <button
        type="button"
        onClick={onAgain}
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-forest px-7 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
      >
        <RotateCcw className="size-4" aria-hidden />
        Check another plant
      </button>
    </div>
  );
}

export default function PlantDoctor({ enabled }: { enabled: boolean }) {
  const status = useAppSelector((state) => state.auth.status);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisRecord | null>(null);
  const [history, setHistory] = useState<DiagnosisSummary[]>([]);

  const loadHistory = useCallback(
    () =>
      apiFetch<{ items: DiagnosisSummary[] }>("/api/plant-doctor")
        .then((data) => data.items)
        .catch(() => [] as DiagnosisSummary[]),
    [],
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    void loadHistory().then((items) => {
      if (!cancelled) setHistory(items);
    });
    return () => {
      cancelled = true;
    };
  }, [status, loadHistory]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setStep((value) => (value + 1) % MESSAGES.length), 2600);
    return () => clearInterval(timer);
  }, [busy]);

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setNotes("");
    setResult(null);
    setError(null);
  };

  const analyse = async () => {
    if (!file || busy) return;
    setBusy(true);
    setStep(0);
    setError(null);
    try {
      const small = await shrinkImage(file).catch(() => file);
      const form = new FormData();
      form.set("photo", new File([small], "plant.jpg", { type: small.type || "image/jpeg" }));
      if (notes.trim()) form.set("notes", notes.trim());
      const record = await apiFetch<DiagnosisRecord>("/api/plant-doctor", { method: "POST", form });
      setResult(record);
      setHistory(await loadHistory());
    } catch (caught) {
      setError(friendly(caught));
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    setError(null);
    try {
      setResult(await apiFetch<DiagnosisRecord>(`/api/plant-doctor/${id}`));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(friendly(caught));
    }
  };

  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/plant-doctor/${id}`, { method: "DELETE" });
      setHistory((items) => items.filter((item) => item.id !== id));
    } catch (caught) {
      setError(friendly(caught));
    }
  };

  if (!enabled) {
    return (
      <div className="rounded-2xl bg-sage-light/60 p-8 text-center">
        <p className="font-display text-2xl text-forest">Plant Doctor is coming soon</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Soon you will be able to photograph a struggling plant and get a care plan. We will tell
          you when it is ready.
        </p>
      </div>
    );
  }

  if (status === "unknown")
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" aria-busy="true" />;

  if (status !== "authenticated") {
    return (
      <div className="mx-auto max-w-lg text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-sage-light text-forest">
          <HeartPulse className="size-7" aria-hidden />
        </span>
        <h2 className="mt-5 font-display text-3xl font-medium text-forest">
          Sign in to check your plant
        </h2>
        <p className="mt-3 text-muted-foreground">
          The Plant Doctor looks at your photo and builds a care plan. A free account keeps your
          checks together.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/login?next=/plant-doctor"
            className="inline-flex min-h-12 items-center rounded-full bg-forest px-8 text-sm font-semibold text-cream hover:bg-forest-deep"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-12 items-center rounded-full border border-forest/30 px-8 text-sm font-semibold text-forest hover:bg-forest hover:text-cream"
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {result ? (
        <Result record={result} onAgain={reset} />
      ) : (
        <div className="mx-auto max-w-2xl space-y-6">
          {!preview ? (
            <div className="rounded-3xl border-2 border-dashed border-sage bg-sage-light/30 p-8 text-center sm:p-12">
              <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-forest text-cream shadow-md">
                <Camera className="size-7" aria-hidden />
              </span>
              <h2 className="mt-5 font-display text-2xl font-medium text-forest sm:text-3xl">
                Show us your plant
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Take a clear, close photo of the leaf or stem that worries you, in daylight. A
                second photo of the whole plant helps too.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => cameraInput.current?.click()}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-forest px-7 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
                >
                  <Camera className="size-4" aria-hidden />
                  Take a photo
                </button>
                <button
                  type="button"
                  onClick={() => galleryInput.current?.click()}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-forest/30 px-7 text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
                >
                  <ImagePlus className="size-4" aria-hidden />
                  Choose a photo
                </button>
              </div>
              <ul className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                {["Daylight", "In focus", "Close to the problem"].map((tip) => (
                  <li key={tip} className="rounded-full bg-card px-3 py-1 ring-1 ring-border/60">
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="relative mx-auto aspect-[4/3] max-h-[28rem] w-full overflow-hidden rounded-3xl bg-sand shadow-lg">
                {/* A blob address of the person's own photo; it is not a remote image, so next/image cannot optimise it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="The photo of your plant"
                  className="size-full object-cover"
                />
                {busy ? (
                  <>
                    <div aria-hidden className="absolute inset-0 bg-forest-deep/35" />
                    <div
                      aria-hidden
                      className="animate-scan absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-transparent via-sage/60 to-transparent"
                    />
                  </>
                ) : null}
              </div>
              {busy ? (
                <p
                  role="status"
                  className="flex items-center justify-center gap-2 text-sm font-medium text-forest"
                >
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {MESSAGES[step]}
                </p>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="pd-notes"
                      className="mb-1.5 block text-sm font-medium text-foreground"
                    >
                      Anything we should know? (optional)
                    </label>
                    <textarea
                      id="pd-notes"
                      rows={3}
                      maxLength={MAX_NOTES_LENGTH}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="How often you water, how much light it gets, when you first noticed it, pets at home…"
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                    />
                    <p className="mt-1 text-right text-xs text-muted-foreground">
                      {notes.length}/{MAX_NOTES_LENGTH}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void analyse()}
                      className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-forest px-8 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep sm:flex-none"
                    >
                      <HeartPulse className="size-4" aria-hidden />
                      Check my plant
                    </button>
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex min-h-12 items-center rounded-full border border-forest/30 px-7 text-sm font-semibold text-forest hover:bg-forest hover:text-cream"
                    >
                      Use a different photo
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <input
            ref={galleryInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </div>
      )}

      {history.length > 0 ? (
        <section aria-labelledby="pd-history" className="mx-auto max-w-2xl">
          <h3 id="pd-history" className="font-display text-xl font-medium text-forest">
            Your recent checks
          </h3>
          <ul className="mt-4 space-y-3">
            {history.map((item) => {
              const tone = HEALTH[item.health];
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60"
                >
                  <button
                    type="button"
                    onClick={() => void open(item.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-medium text-forest">{item.plantName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString("en-US", {
                        dateStyle: "medium",
                      })}{" "}
                      · {item.summary}
                    </span>
                  </button>
                  <span
                    className={`hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline ${tone.tone}`}
                  >
                    {tone.label}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete the check of ${item.plantName}`}
                    onClick={() => void remove(item.id)}
                    className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
