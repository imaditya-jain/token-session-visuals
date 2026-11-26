"use client";

import {
  Check,
  Cloud,
  CloudSun,
  Flower2,
  Leaf,
  Moon,
  RotateCcw,
  Sprout,
  Sun,
  TreeDeciduous,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import SwipeDeck from "@/components/plant-finder/SwipeDeck";
import ProductCard from "@/components/storefront/ProductCard";
import { Button } from "@/components/ui/button";
import {
  BUDGET_STEPS,
  buildDeck,
  isPlant,
  LIGHT_STEPS,
  parseSaved,
  personality,
  rankPlants,
  SIZE_STEPS,
  sizeBucket,
  type Answers,
  type BudgetId,
  type LightId,
  type SizeId,
} from "@/lib/plant-finder";
import type { Product } from "@/lib/types";

const STORAGE_KEY = "fw_plant_finder";
const SAVED_EVENT = "fernwood:plant-finder";

type Step = "intro" | "light" | "size" | "budget" | "swipe" | "result";
const ORDER: Step[] = ["intro", "light", "size", "budget", "swipe", "result"];
const STEP_ICONS = [Sprout, Leaf, Leaf, Flower2, TreeDeciduous, TreeDeciduous];

export type FinderCopy = {
  introTitle: string;
  introText: string;
  introButton: string;
  resultTitle: string;
  retakeLabel: string;
};

const LIGHT_ICONS = [Moon, Cloud, CloudSun, Sun];

const readSaved = (): string | null => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const subscribeSaved = (onChange: () => void) => {
  window.addEventListener(SAVED_EVENT, onChange);
  return () => window.removeEventListener(SAVED_EVENT, onChange);
};
const writeSaved = (value: string | null) => {
  try {
    if (value === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode or blocked storage: the finder works the same, it just can't remember the result.
  }
  window.dispatchEvent(new Event(SAVED_EVENT));
};

function StepHeading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <div className="mb-8 text-center">
      <h2
        ref={ref}
        tabIndex={-1}
        className="font-display text-2xl font-medium text-forest outline-none sm:text-3xl"
      >
        {children}
      </h2>
      {hint ? <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const primary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-clay px-8 py-3 text-sm font-semibold uppercase tracking-wider text-cream shadow-md transition-all hover:bg-clay-deep hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The Plant Finder: a few quick questions about the space, then a deck of plants to swipe, then the matches. The
 * answers and swipes never leave the browser; the last result is remembered for the tab so a refresh keeps it.
 */
export default function PlantFinder({ plants, copy }: { plants: Product[]; copy: FinderCopy }) {
  const saved = useSyncExternalStore(subscribeSaved, readSaved, () => null);
  const restored = useMemo(() => parseSaved(saved), [saved]);

  const [step, setStep] = useState<Step>("intro");
  const [light, setLight] = useState<LightId>("medium");
  const [size, setSize] = useState<SizeId | null>(null);
  const [budget, setBudget] = useState<BudgetId | null>(null);
  const [result, setResult] = useState<{ liked: string[]; passed: string[] } | null>(null);

  const eligible = useMemo(() => plants.filter(isPlant), [plants]);
  const answers = useMemo<Answers | null>(
    () => (size && budget ? { light, size, budget } : null),
    [light, size, budget],
  );
  // A saved result is shown when the person has not started over in this visit.
  const shown = step === "intro" && restored ? restored : null;
  const activeAnswers = shown?.answers ?? answers;
  const activeResult = useMemo(
    () => (shown ? { liked: shown.liked, passed: shown.passed } : result),
    [shown, result],
  );
  const view: Step = shown ? "result" : step;

  const deck = useMemo(() => (answers ? buildDeck(eligible, answers) : []), [eligible, answers]);
  const matches = useMemo(
    () =>
      activeAnswers && activeResult
        ? rankPlants(eligible, activeAnswers, activeResult.liked, activeResult.passed)
        : [],
    [eligible, activeAnswers, activeResult],
  );

  // One sample photo per size, taken from the catalogue itself.
  const sizePhotos = useMemo(() => {
    const photos = new Map<SizeId, Product>();
    for (const plant of eligible) {
      const bucket = sizeBucket(plant.size);
      if (bucket && !photos.has(bucket)) photos.set(bucket, plant);
    }
    return photos;
  }, [eligible]);

  const position = ORDER.indexOf(view);
  const Icon = STEP_ICONS[position] ?? Sprout;
  const progress = Math.round((position / (ORDER.length - 1)) * 100);

  const finishSwipe = (liked: string[], passed: string[]) => {
    if (!answers) return;
    setResult({ liked, passed });
    writeSaved(JSON.stringify({ answers, liked, passed }));
    setStep("result");
  };
  const restart = () => {
    writeSaved(null);
    setResult(null);
    setSize(null);
    setBudget(null);
    setLight("medium");
    setStep("intro");
  };

  if (eligible.length < 3) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border/60">
        <p className="font-display text-xl text-forest">The Plant Finder is getting ready</p>
        <p className="mt-2 text-sm text-muted-foreground">
          We are adding plants to our collection. Meanwhile, browse everything we have.
        </p>
        <Button asChild className="mt-5 h-11 px-7">
          <Link href="/shop">Shop all plants</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-10">
        <div
          role="progressbar"
          aria-label="Plant Finder progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-1.5 w-full overflow-hidden rounded-full bg-sage-light"
        >
          <div
            className="h-full rounded-full bg-clay transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-forest">
          <Icon className="size-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">
            {view === "intro"
              ? "Plant Finder"
              : view === "result"
                ? "Your matches"
                : `Step ${position} of ${ORDER.length - 2}`}
          </span>
        </div>
      </div>

      <div key={view} className="animate-rise">
        {view === "intro" ? (
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl">
              {copy.introTitle}
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">{copy.introText}</p>
            <button type="button" className={`${primary} mt-8`} onClick={() => setStep("light")}>
              {copy.introButton}
            </button>
            <p className="mt-4 text-xs text-muted-foreground">
              Three questions, a few plants to swipe, about a minute.
            </p>
          </div>
        ) : null}

        {view === "light" ? (
          <div className="mx-auto max-w-xl">
            <StepHeading hint="Think about the spot where the plant will live.">
              How much light does your space get?
            </StepHeading>
            {(() => {
              const index = LIGHT_STEPS.findIndex((s) => s.id === light);
              const LightIcon = LIGHT_ICONS[index] ?? Sun;
              const current = LIGHT_STEPS[index];
              return (
                <div className="text-center">
                  <LightIcon
                    className="mx-auto size-24 text-clay transition-all"
                    strokeWidth={1.25}
                    aria-hidden
                  />
                  <label htmlFor="finder-light" className="sr-only">
                    Light in your space
                  </label>
                  <input
                    id="finder-light"
                    type="range"
                    min={0}
                    max={LIGHT_STEPS.length - 1}
                    step={1}
                    value={index}
                    aria-valuetext={current?.label}
                    onChange={(event) =>
                      setLight(LIGHT_STEPS[Number(event.target.value)]?.id ?? "medium")
                    }
                    className="mt-8 h-2 w-full cursor-pointer accent-clay"
                  />
                  <div
                    className="mt-3 flex justify-between text-xs text-muted-foreground"
                    aria-hidden
                  >
                    <span>Dim</span>
                    <span>Sunny</span>
                  </div>
                  <p className="mt-5 font-display text-xl text-forest" aria-live="polite">
                    {current?.label}
                  </p>
                  <p className="text-sm text-muted-foreground">{current?.hint}</p>
                </div>
              );
            })()}
            <div className="mt-10 text-center">
              <button type="button" className={primary} onClick={() => setStep("size")}>
                Next
              </button>
            </div>
          </div>
        ) : null}

        {view === "size" ? (
          <div className="mx-auto max-w-2xl">
            <StepHeading hint="Pick the one that sounds like your home.">
              How much room do you have?
            </StepHeading>
            <fieldset>
              <legend className="sr-only">Space for the plant</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                {SIZE_STEPS.map((option) => {
                  const photo = sizePhotos.get(option.id);
                  const selected = size === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`relative block cursor-pointer overflow-hidden rounded-xl bg-card text-left shadow-sm ring-1 transition-all focus-within:ring-2 focus-within:ring-ring ${
                        selected
                          ? "ring-2 ring-forest shadow-md"
                          : "ring-border/60 hover:-translate-y-0.5 hover:shadow-md"
                      }`}
                    >
                      <input
                        type="radio"
                        name="finder-size"
                        value={option.id}
                        checked={selected}
                        onChange={() => setSize(option.id)}
                        className="sr-only"
                      />
                      {photo ? (
                        <Image
                          src={photo.image}
                          alt=""
                          width={400}
                          height={400}
                          sizes="(min-width: 640px) 200px, 90vw"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <span className="block aspect-square w-full bg-sage-light" aria-hidden />
                      )}
                      <span className="block px-4 py-3">
                        <span className="block font-display text-base font-medium text-forest">
                          {option.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">{option.hint}</span>
                      </span>
                      {selected ? (
                        <span
                          className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-full bg-clay text-cream"
                          aria-hidden
                        >
                          <Check className="size-4" />
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-10 text-center">
              <button
                type="button"
                className={primary}
                disabled={!size}
                onClick={() => setStep("budget")}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        {view === "budget" ? (
          <div className="mx-auto max-w-xl">
            <StepHeading hint="A guide, not a rule. We'll still show you the best fits.">
              What would you like to spend on one plant?
            </StepHeading>
            <fieldset>
              <legend className="sr-only">Budget for one plant</legend>
              <div className="grid grid-cols-2 gap-3">
                {BUDGET_STEPS.map((option) => {
                  const selected = budget === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`relative flex min-h-16 cursor-pointer items-center justify-center rounded-xl bg-card px-4 text-center font-display text-lg text-forest shadow-sm ring-1 transition-all focus-within:ring-2 focus-within:ring-ring ${
                        selected
                          ? "bg-sage-light ring-2 ring-forest"
                          : "ring-border/60 hover:shadow-md"
                      }`}
                    >
                      <input
                        type="radio"
                        name="finder-budget"
                        value={option.id}
                        checked={selected}
                        onChange={() => setBudget(option.id)}
                        className="sr-only"
                      />
                      {option.label}
                      {selected ? <Check className="ml-2 size-4 text-clay" aria-hidden /> : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-10 text-center">
              <button
                type="button"
                className={primary}
                disabled={!budget}
                onClick={() => setStep("swipe")}
              >
                Show me plants
              </button>
            </div>
          </div>
        ) : null}

        {view === "swipe" && answers ? (
          <div>
            <StepHeading hint="Like the ones that catch your eye and pass on the rest. We'll learn what you like.">
              Which of these would you take home?
            </StepHeading>
            <SwipeDeck deck={deck} onDone={finishSwipe} />
          </div>
        ) : null}

        {view === "result" && activeAnswers ? (
          <div>
            <StepHeading>{copy.resultTitle}</StepHeading>
            <div className="mx-auto mb-10 max-w-xl rounded-2xl bg-sage-light/60 p-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-clay">
                Your plant personality
              </p>
              <p className="mt-2 font-display text-2xl text-forest">
                {personality(activeAnswers).name}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {personality(activeAnswers).description}
              </p>
            </div>
            <ul aria-label="Your best matches" className="grid gap-6 sm:grid-cols-3">
              {matches.map(({ plant, reasons }) => (
                <li key={plant.id} className="flex flex-col gap-3">
                  <ProductCard product={plant} />
                  {reasons.length > 0 ? (
                    <ul
                      aria-label={`Why ${plant.name} suits you`}
                      className="flex flex-wrap gap-1.5"
                    >
                      {reasons.map((reason) => (
                        <li
                          key={reason.id + reason.text}
                          className="rounded-full bg-sage-light px-3 py-1 text-xs text-forest"
                        >
                          {reason.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
              <Button asChild className="h-11 px-7">
                <Link href="/shop">Browse all plants</Link>
              </Button>
              <Button type="button" variant="outline" className="h-11 gap-2 px-7" onClick={restart}>
                <RotateCcw className="size-4" aria-hidden /> {copy.retakeLabel}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
