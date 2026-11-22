"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import PageHeader from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { SOCIAL_PLATFORMS, type SiteChrome, type SocialPlatform } from "@/lib/site-chrome";
import { useAppSelector } from "@/store/hooks";

type AdminChrome = {
  draft: SiteChrome;
  published: SiteChrome;
  publishedAt: string | null;
  hasUnpublished: boolean;
};

const messageOf = (error: unknown): string => {
  if (error instanceof ApiError) {
    const fields = error.fields?.map((f) => f.message).filter(Boolean);
    return fields?.length ? fields.slice(0, 3).join(" ") : error.message;
  }
  return "Network problem. Check your connection and try again.";
};

type Busy = "save" | "publish" | "discard" | null;

type ChromeContextValue = {
  load: ReturnType<typeof useApiResource<AdminChrome>>;
};

/**
 * The draft lives above the three site pages (header, footer, social links) so moving between them keeps every
 * unsaved edit. One set of buttons saves, publishes or discards the whole thing.
 */
const Ctx = createContext<(ChromeContextValue & Session) | null>(null);

type Session = {
  server: AdminChrome | null;
  draft: SiteChrome | null;
  setDraft: (next: SiteChrome) => void;
  busy: Busy;
  error: string | null;
  notice: string | null;
  run: (kind: "save" | "publish" | "discard") => Promise<void>;
  dirty: boolean;
};

export function ChromeProvider({ children }: { children: ReactNode }) {
  const load = useApiResource<AdminChrome>("/api/admin/site/chrome");
  const [server, setServer] = useState<AdminChrome | null>(null);
  const [draft, setDraftState] = useState<SiteChrome | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // First arrival of the server copy seeds the draft; after that the draft is the editor's own.
  if (load.status === "ready" && server === null) {
    setServer(load.data);
    setDraftState(load.data.draft);
  }

  const dirty =
    server !== null && draft !== null && JSON.stringify(draft) !== JSON.stringify(server.draft);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const run = async (kind: "save" | "publish" | "discard") => {
    if (!server || !draft) return;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "discard") {
        const next = await apiFetch<AdminChrome>("/api/admin/site/chrome/discard", {
          method: "POST",
        });
        setServer(next);
        setDraftState(next.draft);
        setNotice("Unpublished changes discarded.");
        return;
      }
      let saved = server;
      if (dirty || kind === "save") {
        saved = await apiFetch<AdminChrome>("/api/admin/site/chrome", {
          method: "PUT",
          json: draft,
        });
        setServer(saved);
        setDraftState(saved.draft);
      }
      if (kind === "save")
        return setNotice("Draft saved. It isn't on the website until you publish.");
      const published = await apiFetch<AdminChrome & { hidden: SocialPlatform[] }>(
        "/api/admin/site/chrome/publish",
        { method: "POST" },
      );
      setServer(published);
      setDraftState(published.draft);
      setNotice(
        published.hidden.length
          ? `Published. These social links have no address yet and were hidden: ${published.hidden.map((p) => SOCIAL_PLATFORMS[p]).join(", ")}.`
          : "Published. The change is live on every page.",
      );
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Ctx.Provider
      value={{ load, server, draft, setDraft: setDraftState, busy, error, notice, run, dirty }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** A page of the Website section: shows the shared status bar, then the page's own fields. */
export default function ChromeEditor({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: (draft: SiteChrome, update: (next: SiteChrome) => void) => ReactNode;
}) {
  const ctx = useContext(Ctx);
  const canPublish = useAppSelector(
    (s) => s.admin.access?.permissions.includes("site:publish") ?? false,
  );
  if (!ctx) throw new Error("ChromeEditor must be used inside ChromeProvider");
  const { load, server, draft, setDraft, busy, error, notice, run, dirty } = ctx;

  if (load.status === "error") {
    return (
      <>
        <PageHeader title={title} />
        <div role="alert" className="text-sm text-destructive">
          {load.message}{" "}
          <button className="underline" onClick={load.retry}>
            Try again
          </button>
        </div>
      </>
    );
  }
  if (!server || !draft) {
    return (
      <>
        <PageHeader title={title} />
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      </>
    );
  }

  const status = dirty
    ? "You have unsaved changes."
    : server.hasUnpublished
      ? "Saved as a draft. Not published yet."
      : server.publishedAt
        ? `Published ${new Date(server.publishedAt).toLocaleString()}.`
        : "Showing the original content. Nothing has been customised yet.";

  return (
    <>
      <PageHeader title={title} lead={lead} />
      <div className="sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <p role="status" className="mr-auto text-sm text-muted-foreground">
          {status}{" "}
          <span className="hidden sm:inline">
            Header, footer and social links are published together.
          </span>
        </p>
        {server.hasUnpublished && !dirty ? (
          <Button
            variant="outline"
            className="h-11"
            disabled={busy !== null}
            onClick={() => void run("discard")}
          >
            Discard changes
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="h-11"
          disabled={busy !== null || !dirty}
          onClick={() => void run("save")}
        >
          {busy === "save" ? "Saving…" : "Save draft"}
        </Button>
        {canPublish ? (
          <Button
            className="h-11"
            disabled={busy !== null || (!dirty && !server.hasUnpublished)}
            onClick={() => void run("publish")}
          >
            {busy === "publish" ? "Publishing…" : "Publish"}
          </Button>
        ) : null}
      </div>
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
      <fieldset disabled={busy !== null} className="min-w-0 space-y-8 border-0 p-0">
        {children(draft, setDraft)}
      </fieldset>
    </>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-border/60 sm:p-6">
      <h2 className="font-display text-xl text-forest">{title}</h2>
      {hint ? (
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{hint}</p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}

export const fieldClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
