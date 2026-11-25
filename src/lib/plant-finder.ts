import type { Product } from "@/lib/types";

/**
 * The Plant Finder's matching. It uses only what the catalogue really says about a plant: the light it likes, its
 * size, its price, whether it is in stock and its category. Nothing here is invented (no "easy care" or "pet safe"
 * claims, which the catalogue does not hold), so every reason shown to a shopper can be traced to the product page.
 */

export const LIGHT_STEPS = [
  { id: "low", label: "A dim corner", hint: "Little daylight, away from the window" },
  { id: "medium", label: "Some daylight", hint: "A bright room, a few steps from the window" },
  { id: "bright", label: "A bright window", hint: "Lots of light, no harsh midday sun" },
  { id: "sun", label: "A sunny spot", hint: "Direct sun for part of the day" },
] as const;
export type LightId = (typeof LIGHT_STEPS)[number]["id"];

export const SIZE_STEPS = [
  { id: "small", label: "On a shelf or desk", hint: "Compact, up to about 10 in" },
  { id: "medium", label: "On a table or sideboard", hint: "Mid-sized, up to about 26 in" },
  { id: "large", label: "On the floor", hint: "A statement plant, taller than 26 in" },
] as const;
export type SizeId = (typeof SIZE_STEPS)[number]["id"];

export const BUDGET_STEPS = [
  { id: "starter", label: "Up to $25", cap: 25 },
  { id: "mid", label: "Up to $50", cap: 50 },
  { id: "premium", label: "Up to $90", cap: 90 },
  { id: "any", label: "No limit", cap: Number.POSITIVE_INFINITY },
] as const;
export type BudgetId = (typeof BUDGET_STEPS)[number]["id"];

export type Answers = { light: LightId; size: SizeId; budget: BudgetId };

/** What the finder needs of a product; small, so the whole list can travel to the browser. */
export type FinderPlant = Pick<
  Product,
  "id" | "slug" | "name" | "category" | "price" | "image" | "light" | "size" | "inStock"
>;

const NON_PLANT = /pot|planter|seed|tool|gift|accessor|soil|fertili[sz]er|card/i;
export const isPlant = (product: Pick<Product, "category">): boolean =>
  !NON_PLANT.test(product.category);

const LIGHT_ORDER: readonly LightId[] = ["low", "medium", "bright", "sun"];

/** The range of light levels (inclusive, as positions 0-3) a plant's care text says it is happy with, or null if it says nothing. */
export function lightRange(text: string): [number, number] | null {
  const t = text.toLowerCase();
  if (/low to bright/.test(t)) return [0, 2];
  if (/full sun/.test(t)) return [3, 3];
  // `\b` so that "indirect" is not read as "direct".
  if (/\bdirect/.test(t)) return [2, 3];
  if (/low/.test(t)) return [0, 1];
  if (/bright/.test(t)) return [2, 2];
  if (/medium|soft/.test(t)) return [1, 2];
  return null;
}

/** The tallest/widest measurement in a size text such as `24" — 34" tall` or `6" — 10" across`, in inches. */
export function sizeMax(text: string): number | null {
  const numbers = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:"|in\b|inch)/gi)].map((m) =>
    Number(m[1]),
  );
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

export function sizeBucket(text: string): SizeId | null {
  const max = sizeMax(text);
  if (max === null) return null;
  return max <= 10 ? "small" : max <= 26 ? "medium" : "large";
}

export type Reason = { id: "light" | "size" | "budget" | "liked"; text: string };
export type Match<T extends FinderPlant = FinderPlant> = {
  plant: T;
  score: number;
  reasons: Reason[];
};

const SIZE_ORDER: readonly SizeId[] = ["small", "medium", "large"];

/** How well a plant fits what the shopper told us about their space (higher is better). */
function fit(plant: FinderPlant, answers: Answers): { score: number; reasons: Reason[] } {
  let score = 0;
  const reasons: Reason[] = [];

  const range = lightRange(plant.light);
  if (range) {
    const want = LIGHT_ORDER.indexOf(answers.light);
    const distance = want < range[0] ? range[0] - want : want > range[1] ? want - range[1] : 0;
    if (distance === 0) {
      score += 3;
      reasons.push({ id: "light", text: `Happy in ${plant.light.toLowerCase()}` });
    } else if (distance === 1) score += 1;
    else score -= 4;
  }

  const bucket = sizeBucket(plant.size);
  if (bucket) {
    const gap = Math.abs(SIZE_ORDER.indexOf(bucket) - SIZE_ORDER.indexOf(answers.size));
    if (gap === 0) {
      score += 2;
      reasons.push({ id: "size", text: `Fits your space (${plant.size})` });
    } else if (gap === 2) score -= 2;
  }

  const cap = BUDGET_STEPS.find((b) => b.id === answers.budget)?.cap ?? Number.POSITIVE_INFINITY;
  if (plant.price <= cap) {
    score += 1;
    if (Number.isFinite(cap)) reasons.push({ id: "budget", text: "Within your budget" });
  } else score -= 3;

  return { score, reasons };
}

/** The plants worth showing as swipe cards: those that suit the space best, a few of each kind. */
export function buildDeck<T extends FinderPlant>(plants: T[], answers: Answers, size = 8): T[] {
  const ranked = plants
    .filter(isPlant)
    .map((plant, index) => ({
      plant,
      index,
      score: fit(plant, answers).score + (plant.inStock ? 0 : -5),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const byCategory = new Map<string, typeof ranked>();
  for (const entry of ranked) {
    const list = byCategory.get(entry.plant.category) ?? [];
    list.push(entry);
    byCategory.set(entry.plant.category, list);
  }
  // Take turns between categories so the cards aren't all the same kind of plant.
  const deck: T[] = [];
  const lists = [...byCategory.values()];
  for (let round = 0; deck.length < size && lists.some((list) => round < list.length); round++) {
    for (const list of lists) {
      const entry = list[round];
      if (entry && deck.length < size) deck.push(entry.plant);
    }
  }
  return deck;
}

/** Ranks the plants for the answers and the swipes. Out-of-stock plants never take the top places. */
export function rankPlants<T extends FinderPlant>(
  plants: T[],
  answers: Answers,
  liked: readonly string[],
  passed: readonly string[],
  limit = 3,
): Match<T>[] {
  const eligible = plants.filter(isPlant);
  const likedPlants = eligible.filter((p) => liked.includes(p.id));
  const passedPlants = eligible.filter((p) => passed.includes(p.id));

  const similarity = (a: FinderPlant, b: FinderPlant): number => {
    let s = 0;
    if (a.category === b.category) s += 1.5;
    const ra = lightRange(a.light);
    const rb = lightRange(b.light);
    if (ra && rb && ra[0] <= rb[1] && rb[0] <= ra[1]) s += 0.75;
    const sa = sizeBucket(a.size);
    if (sa && sa === sizeBucket(b.size)) s += 0.75;
    return s;
  };

  const matches = eligible.map((plant, index): Match<T> & { index: number } => {
    const base = fit(plant, answers);
    let score = base.score;
    const reasons = [...base.reasons];
    if (liked.includes(plant.id)) {
      score += 3;
      reasons.push({ id: "liked", text: "You liked this one" });
    }
    const likedLike = likedPlants
      .filter((other) => other.id !== plant.id)
      .reduce((sum, other) => sum + similarity(plant, other), 0);
    const passedLike = passedPlants
      .filter((other) => other.id !== plant.id)
      .reduce((sum, other) => sum + similarity(plant, other), 0);
    score += likedLike - passedLike * 0.5;
    if (!liked.includes(plant.id) && likedLike >= 1.5)
      reasons.push({ id: "liked", text: "Similar to plants you liked" });
    if (passed.includes(plant.id)) score -= 3;
    if (!plant.inStock) score -= 5;
    return { plant, score, reasons, index };
  });

  return matches
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ plant, score, reasons }) => ({ plant, score, reasons }));
}

const PERSONALITIES: Record<LightId, { name: string; line: string }> = {
  low: {
    name: "The Low-Light Lover",
    line: "Your space is calm and shaded, and there are plants that love exactly that.",
  },
  medium: {
    name: "The Everyday Gardener",
    line: "Good daylight and a steady home: you have room for plenty of plants to thrive.",
  },
  bright: {
    name: "The Sunroom Dreamer",
    line: "Your home is full of light, which most leafy plants dream of.",
  },
  sun: {
    name: "The Sun Seeker",
    line: "You have real sunshine to offer, so bold and sun-loving plants will feel at home.",
  },
};

const SIZE_LINES: Record<SizeId, string> = {
  small: "You like to keep things compact.",
  medium: "You have a good spot on a table or sideboard.",
  large: "And you have the room for a statement piece.",
};

export function personality(answers: Answers): { name: string; description: string } {
  const base = PERSONALITIES[answers.light];
  return { name: base.name, description: `${base.line} ${SIZE_LINES[answers.size]}` };
}

export const DEFAULT_ANSWERS: Answers = { light: "medium", size: "medium", budget: "any" };

/** Reads saved answers back safely (anything unexpected falls back to nothing, never to an error). */
export function parseSaved(
  raw: string | null,
): { answers: Answers; liked: string[]; passed: string[] } | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const v = value as Record<string, unknown>;
    const a = v["answers"] as Record<string, unknown> | undefined;
    const light = LIGHT_STEPS.find((s) => s.id === a?.["light"])?.id;
    const size = SIZE_STEPS.find((s) => s.id === a?.["size"])?.id;
    const budget = BUDGET_STEPS.find((s) => s.id === a?.["budget"])?.id;
    const ids = (x: unknown): string[] =>
      Array.isArray(x) ? x.filter((i): i is string => typeof i === "string").slice(0, 50) : [];
    if (!light || !size || !budget) return null;
    return { answers: { light, size, budget }, liked: ids(v["liked"]), passed: ids(v["passed"]) };
  } catch {
    return null;
  }
}
