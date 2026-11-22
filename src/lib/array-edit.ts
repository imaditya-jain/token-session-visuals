/** Pure helpers for editing ordered lists in forms (never mutate the original). */

export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const copy = [...list];
  const [item] = copy.splice(index, 1) as [T];
  copy.splice(target, 0, item);
  return copy;
}

export const removeAt = <T>(list: readonly T[], index: number): T[] =>
  list.filter((_, i) => i !== index);

export const replaceAt = <T>(list: readonly T[], index: number, value: T): T[] =>
  list.map((entry, i) => (i === index ? value : entry));

export const patchAt = <T extends object>(
  list: readonly T[],
  index: number,
  patch: Partial<T>,
): T[] => list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
