"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ReelDialog from "@/components/reels/ReelDialog";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch, publicJson } from "@/lib/api-client";
import { REEL_TOPIC_LABELS, REEL_TOPICS, type ReelDto, type ReelTopic } from "@/lib/reels";
import { useAppSelector } from "@/store/hooks";

type Page = { reels: ReelDto[]; nextCursor: string | null };

/** Reads work for guests and members alike; a member's request also carries their token so "liked" is right. */
export function useReelRead() {
  const status = useAppSelector((state) => state.auth.status);
  const read = useCallback(
    <T,>(path: string) =>
      status === "authenticated" ? apiFetch<T>(path) : publicJson<T>(path, "GET"),
    [status],
  );
  return { read, ready: status !== "unknown", signedIn: status === "authenticated" };
}

export default function ReelsFeed() {
  const { read, ready } = useReelRead();
  const [topic, setTopic] = useState<ReelTopic | null>(null);
  const [items, setItems] = useState<ReelDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "off">("loading");
  const [open, setOpen] = useState<ReelDto | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (after?: string) => {
      const mine = ++seq.current;
      const query = new URLSearchParams({
        ...(topic ? { topic } : {}),
        ...(after ? { cursor: after } : {}),
      });
      try {
        const page = await read<Page>(`/api/reels${query.size ? `?${query.toString()}` : ""}`);
        if (mine !== seq.current) return;
        setItems((current) => (after ? [...current, ...page.reels] : page.reels));
        setCursor(page.nextCursor);
        setState("ready");
      } catch (error) {
        if (mine !== seq.current) return;
        setState(
          error instanceof ApiError && error.code === "reels_not_configured" ? "off" : "error",
        );
      }
    },
    [read, topic],
  );

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload whenever the filter or the sign-in state changes
    void load();
  }, [load, ready]);

  if (state === "off") {
    return (
      <p role="status" className="px-4 text-center text-muted-foreground">
        Reels are almost here. Check back soon.
      </p>
    );
  }

  return (
    <div className="px-4 lg:px-0">
      <div role="group" aria-label="Topic" className="mb-6 flex flex-wrap justify-center gap-2">
        {([null, ...REEL_TOPICS] as (ReelTopic | null)[]).map((id) => (
          <button
            key={id ?? "all"}
            aria-pressed={topic === id}
            onClick={() => {
              setState("loading");
              setTopic(id);
            }}
            className={`min-h-11 rounded-full px-5 text-sm ${topic === id ? "bg-forest text-cream" : "bg-card ring-1 ring-border hover:bg-muted"}`}
          >
            {id ? REEL_TOPIC_LABELS[id] : "All"}
          </button>
        ))}
      </div>

      {state === "error" ? (
        <p role="alert" className="text-center text-muted-foreground">
          We couldn&apos;t load reels. Please try again.
        </p>
      ) : state === "loading" ? (
        <div aria-hidden className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-muted-foreground">
          Nothing here yet. Be the first from the Fernwood app.
        </p>
      ) : (
        <>
          <h2 className="sr-only">Latest reels and posts</h2>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {items.map((reel) => (
              <li key={reel.id}>
                <button
                  onClick={() => setOpen(reel)}
                  aria-label={`Open ${reel.format} by ${reel.author}${reel.caption ? `: ${reel.caption}` : ""}`}
                  className="group relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted text-left"
                >
                  {reel.kind === "video" ? (
                    <video
                      src={reel.mediaUrl}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- community pictures come from our storage, not the Shopify image loader
                    <img
                      src={reel.mediaUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-forest-deep/80 to-transparent p-3 text-xs text-cream">
                    <span className="block font-medium">{reel.author}</span>
                    <span className="opacity-80">
                      {reel.format === "reel" ? "Reel · 24 h" : "Post"} · {reel.likes} likes
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {cursor ? (
            <div className="mt-8 text-center">
              <Button variant="outline" className="h-11" onClick={() => void load(cursor)}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
      {open ? <ReelDialog reel={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
