import { describe, expect, it } from "vitest";

import { moveItem, patchAt, removeAt, replaceAt } from "./array-edit";

describe("array-edit", () => {
  it("moves an item one step and stops at the ends", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a"], 5, 1)).toEqual(["a"]);
  });
  it("never changes the original list", () => {
    const original = ["a", "b"];
    moveItem(original, 0, 1);
    removeAt(original, 0);
    replaceAt(original, 0, "z");
    expect(original).toEqual(["a", "b"]);
  });
  it("removes, replaces and patches by index", () => {
    expect(removeAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    expect(replaceAt(["a", "b"], 1, "z")).toEqual(["a", "z"]);
    expect(
      patchAt(
        [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
        1,
        { y: 9 },
      ),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 9 },
    ]);
  });
});
