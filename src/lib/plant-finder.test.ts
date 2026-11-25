import { describe, expect, it } from "vitest";

import {
  buildDeck,
  isPlant,
  lightRange,
  parseSaved,
  personality,
  rankPlants,
  sizeBucket,
  sizeMax,
  type Answers,
  type FinderPlant,
} from "./plant-finder";

const plant = (id: string, over: Partial<FinderPlant> = {}): FinderPlant => ({
  id,
  slug: id,
  name: id,
  category: "House Plants",
  price: 30,
  image: "/x.jpg",
  light: "Medium, indirect light",
  size: '18" — 24" tall',
  inStock: true,
  ...over,
});

describe("reading the catalogue's care text", () => {
  it.each([
    ["Low to bright light", [0, 2]],
    ["Thrives in low light", [0, 1]],
    ["Medium, indirect light", [1, 2]],
    ["Soft, indirect light", [1, 2]],
    ["Bright, indirect light", [2, 2]],
    ["Bright, filtered light", [2, 2]],
    ["Bright, direct light", [2, 3]],
    ["Full sun", [3, 3]],
  ])("%s", (text, range) => expect(lightRange(text)).toEqual(range));

  it("says nothing when the text says nothing", () => {
    expect(lightRange("Drainage holes included")).toBeNull();
    expect(lightRange("")).toBeNull();
  });

  it("reads sizes and buckets them", () => {
    expect(sizeMax('24" — 34" tall')).toBe(34);
    expect(sizeMax('6" — 10" across')).toBe(10);
    expect(sizeMax("5 packets")).toBeNull();
    expect(sizeBucket('4" — 6" across')).toBe("small");
    expect(sizeBucket('18" — 26" tall')).toBe("medium");
    expect(sizeBucket('36" — 48" tall')).toBe("large");
  });

  it("only treats plants as plants", () => {
    expect(isPlant({ category: "House Plants" })).toBe(true);
    expect(isPlant({ category: "Succulents & Cacti" })).toBe(true);
    for (const category of ["Pots & Planters", "Seeds & Tools", "Gifts", "Gift Card"])
      expect(isPlant({ category }), category).toBe(false);
  });
});

describe("ranking", () => {
  const low: Answers = { light: "low", size: "medium", budget: "any" };
  const plants = [
    plant("sun-lover", { light: "Full sun", size: '6" — 10" across' }),
    plant("shade-lover", { light: "Thrives in low light" }),
    plant("window", { light: "Bright, indirect light" }),
  ];

  it("puts the plant that suits the light first, with a reason taken from its own care text", () => {
    const [top] = rankPlants(plants, low, [], []);
    expect(top?.plant.id).toBe("shade-lover");
    expect(top?.reasons.map((r) => r.text)).toContain("Happy in thrives in low light");
  });

  it("pushes down a plant that needs much more light than the space has", () => {
    const ids = rankPlants(plants, low, [], [], 3).map((m) => m.plant.id);
    expect(ids.at(-1)).toBe("sun-lover");
  });

  it("respects the budget softly", () => {
    const priced = [plant("cheap", { price: 12 }), plant("dear", { price: 80 })];
    const [top] = rankPlants(
      priced,
      { light: "medium", size: "medium", budget: "starter" },
      [],
      [],
    );
    expect(top?.plant.id).toBe("cheap");
  });

  it("an out-of-stock plant never takes the top place over an equal one in stock", () => {
    const pair = [plant("sold-out", { inStock: false }), plant("available")];
    expect(
      rankPlants(pair, { light: "medium", size: "medium", budget: "any" }, [], [])[0]?.plant.id,
    ).toBe("available");
  });

  it("what was liked lifts similar plants, what was passed lowers them", () => {
    const a = plant("a", {
      category: "Succulents & Cacti",
      light: "Full sun",
      size: '4" — 6" across',
    });
    const b = plant("b", {
      category: "Succulents & Cacti",
      light: "Bright, direct light",
      size: '6" — 8" across',
    });
    const c = plant("c", { category: "House Plants", light: "Thrives in low light" });
    const neutral: Answers = { light: "bright", size: "small", budget: "any" };
    const scoreOf = (matches: ReturnType<typeof rankPlants>, id: string) =>
      matches.find((m) => m.plant.id === id)!.score;

    const none = rankPlants([a, b, c], neutral, [], [], 3);
    const likedA = rankPlants([a, b, c], neutral, [a.id], [], 3);
    const passedA = rankPlants([a, b, c], neutral, [], [a.id], 3);

    expect(scoreOf(likedA, "a")).toBeGreaterThan(scoreOf(none, "a"));
    expect(scoreOf(likedA, "b")).toBeGreaterThan(scoreOf(none, "b")); // b is like a
    expect(scoreOf(likedA, "c")).toBe(scoreOf(none, "c")); // c is not
    expect(likedA.find((m) => m.plant.id === "b")?.reasons.map((r) => r.text)).toContain(
      "Similar to plants you liked",
    );
    expect(scoreOf(passedA, "a")).toBeLessThan(scoreOf(none, "a"));
    expect(scoreOf(passedA, "b")).toBeLessThan(scoreOf(none, "b"));
  });

  it("never offers pots, seeds or tools", () => {
    const mixed = [
      plant("fern"),
      plant("pot", { category: "Pots & Planters", light: "Drainage holes included" }),
    ];
    expect(rankPlants(mixed, low, [], []).map((m) => m.plant.id)).toEqual(["fern"]);
  });
});

describe("the swipe deck", () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    plant(`p${i}`, { category: i % 2 ? "House Plants" : "Succulents & Cacti" }),
  );

  it("holds at most the requested number, mixes the kinds, and skips non-plants", () => {
    const deck = buildDeck(
      [...many, plant("pot", { category: "Pots & Planters" })],
      { light: "medium", size: "medium", budget: "any" },
      8,
    );
    expect(deck).toHaveLength(8);
    expect(new Set(deck.map((p) => p.category)).size).toBe(2);
    expect(deck.some((p) => p.id === "pot")).toBe(false);
    expect(new Set(deck.map((p) => p.id)).size).toBe(8);
  });

  it("is shorter when there are fewer plants, and empty when there are none", () => {
    expect(
      buildDeck(many.slice(0, 3), { light: "low", size: "small", budget: "any" }),
    ).toHaveLength(3);
    expect(buildDeck([], { light: "low", size: "small", budget: "any" })).toEqual([]);
  });
});

describe("personality and saved answers", () => {
  it("names the shopper by their light and mentions their space", () => {
    const p = personality({ light: "sun", size: "large", budget: "any" });
    expect(p.name).toBe("The Sun Seeker");
    expect(p.description).toContain("statement piece");
  });

  it("restores valid saved answers and ignores anything else", () => {
    const good = JSON.stringify({
      answers: { light: "low", size: "small", budget: "mid" },
      liked: ["a"],
      passed: ["b", 3],
    });
    expect(parseSaved(good)).toEqual({
      answers: { light: "low", size: "small", budget: "mid" },
      liked: ["a"],
      passed: ["b"],
    });
    for (const bad of [null, "", "not json", "{}", '{"answers":{"light":"x"}}', "[]", "null"])
      expect(parseSaved(bad), String(bad)).toBeNull();
  });
});
