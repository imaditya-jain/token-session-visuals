"use client";

import { Heart, Undo2, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState, useSyncExternalStore } from "react";

import { formatPrice } from "@/lib/format";
import type { FinderPlant } from "@/lib/plant-finder";

const THRESHOLD = 110; // px to drag before a release counts as a decision
const FLICK = 0.55; // px per ms: a quick flick decides even over a short distance
const EXIT_MS = 260;

const noMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const subscribeMotion = (onChange: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

type Verdict = "like" | "pass";

/**
 * Swipe cards: drag a plant right to like it or left to pass, press the buttons, or use the arrow keys. Every way
 * does the same thing. Reduced motion skips the flying-off animation but keeps all the controls.
 */
export default function SwipeDeck({
  deck,
  onDone,
}: {
  deck: FinderPlant[];
  onDone: (liked: string[], passed: string[]) => void;
}) {
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState<Verdict | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const reduced = useSyncExternalStore(subscribeMotion, noMotion, () => false);

  const index = verdicts.length;
  const current = deck[index];
  const total = deck.length;

  const finish = (all: Verdict[]) => {
    const liked = deck.filter((_, i) => all[i] === "like").map((p) => p.id);
    const passed = deck.filter((_, i) => all[i] === "pass").map((p) => p.id);
    onDone(liked, passed);
  };

  const decide = (verdict: Verdict) => {
    if (!current || leaving) return;
    setAnnouncement(`${verdict === "like" ? "Liked" : "Passed on"} ${current.name}.`);
    const commit = () => {
      const next = [...verdicts, verdict];
      setVerdicts(next);
      setLeaving(null);
      setDrag(null);
      if (next.length === total) finish(next);
    };
    if (reduced) return commit();
    setLeaving(verdict);
    window.setTimeout(commit, EXIT_MS);
  };

  const undo = () => {
    if (leaving || verdicts.length === 0) return;
    setVerdicts(verdicts.slice(0, -1));
    setAnnouncement("Went back one plant.");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (leaving || event.button > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    setDrag({ x: 0, y: 0 });
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    setDrag({ x: event.clientX - start.current.x, y: event.clientY - start.current.y });
  };
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = start.current;
    start.current = null;
    if (!from) return;
    const dx = event.clientX - from.x;
    const speed = Math.abs(dx) / Math.max(1, event.timeStamp - from.t);
    if (Math.abs(dx) > THRESHOLD || (speed > FLICK && Math.abs(dx) > 30))
      decide(dx > 0 ? "like" : "pass");
    else setDrag(null);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      decide("like");
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      decide("pass");
    } else if (event.key === "Backspace") {
      event.preventDefault();
      undo();
    }
  };

  const dx = leaving ? (leaving === "like" ? 1 : -1) * 700 : (drag?.x ?? 0);
  const dy = leaving ? 40 : (drag?.y ?? 0) * 0.25;
  const likeStrength = Math.min(1, Math.max(0, dx / THRESHOLD));
  const passStrength = Math.min(1, Math.max(0, -dx / THRESHOLD));
  const animating = drag === null || leaving !== null;

  return (
    <div className="mx-auto w-full max-w-sm" onKeyDown={onKeyDown}>
      <p className="mb-4 text-center text-sm text-muted-foreground">
        {index < total ? `Plant ${index + 1} of ${total}` : "All done"}
      </p>

      <div
        role="group"
        aria-label="Plants to like or pass"
        tabIndex={0}
        className="relative mx-auto aspect-[3/4] w-full max-w-[19rem] touch-pan-y rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        {deck.slice(index, index + 3).map((plant, depth) => {
          const top = depth === 0;
          return (
            <div
              key={plant.id}
              {...(top
                ? {
                    onPointerDown,
                    onPointerMove,
                    onPointerUp: onPointerEnd,
                    onPointerCancel: onPointerEnd,
                  }
                : {})}
              aria-hidden={!top}
              className={`absolute inset-0 overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-border/60 ${
                top ? "cursor-grab select-none active:cursor-grabbing" : "pointer-events-none"
              }`}
              style={{
                zIndex: 3 - depth,
                transform: top
                  ? `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`
                  : `translateY(${depth * 10}px) scale(${1 - depth * 0.05})`,
                transition:
                  animating && !reduced
                    ? `transform ${EXIT_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${EXIT_MS}ms`
                    : "none",
                opacity: leaving && top ? 0 : 1,
              }}
            >
              <Image
                src={plant.image}
                alt={top ? plant.name : ""}
                width={600}
                height={760}
                sizes="304px"
                draggable={false}
                priority={top}
                className="pointer-events-none h-3/4 w-full object-cover"
              />
              <div className="flex h-1/4 flex-col justify-center px-5">
                <p className="font-display text-lg font-medium leading-tight text-forest">
                  {plant.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plant.category} · {formatPrice(plant.price)}
                </p>
                <p className="text-xs text-muted-foreground">{plant.light}</p>
              </div>
              {top ? (
                <>
                  <span
                    aria-hidden
                    className="absolute left-4 top-4 -rotate-12 rounded-md border-2 border-forest bg-cream/90 px-3 py-1 font-display text-lg font-semibold uppercase tracking-wider text-forest"
                    style={{ opacity: likeStrength }}
                  >
                    Like
                  </span>
                  <span
                    aria-hidden
                    className="absolute right-4 top-4 rotate-12 rounded-md border-2 border-clay bg-cream/90 px-3 py-1 font-display text-lg font-semibold uppercase tracking-wider text-clay"
                    style={{ opacity: passStrength }}
                  >
                    Pass
                  </span>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={undo}
          disabled={index === 0 || leaving !== null}
          aria-label="Go back one plant"
          className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-forest disabled:opacity-30"
        >
          <Undo2 className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => decide("pass")}
          disabled={!current}
          aria-label={current ? `Pass on ${current.name}` : "Pass"}
          className="inline-flex size-14 items-center justify-center rounded-full bg-muted text-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
        >
          <X className="size-6" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => decide("like")}
          disabled={!current}
          aria-label={current ? `Like ${current.name}` : "Like"}
          className="inline-flex size-14 items-center justify-center rounded-full bg-forest text-cream shadow-sm transition-transform hover:scale-105 active:scale-95"
        >
          <Heart className="size-6 fill-current" aria-hidden />
        </button>
        <span className="size-11" aria-hidden />
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Swipe or drag a card, use the buttons, or press the left and right arrow keys.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
