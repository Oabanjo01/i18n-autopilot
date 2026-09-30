/**
 * Generate stable translation keys from extracted source strings.
 */

import { ExtractedString } from "./parser";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on",
  "at", "to", "for", "of", "with", "is", "it", "this",
]);

function toKey(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .filter((w) => !STOP_WORDS.has(w))
    .slice(0, 3);

  return words.join("_") || "string";
}

/**
 * Assigns a key to every extracted string. Identical English shares one key.
 * A key already taken — in `existing` (the current en.json) or earlier in this
 * run — by different English is never reused; the next free `_2`, `_3`, …
 * suffix is used instead, so strings are never overwritten or silently shared.
 */
export function generateKeys(
  extracted: ExtractedString[],
  existing: Record<string, string> = {},
): ExtractedString[] {
  const assigned = new Map<string, string>(Object.entries(existing));

  return extracted.map((item) => {
    const base = toKey(item.value);
    let key = base;
    let n = 1;

    while (assigned.has(key) && assigned.get(key) !== item.value) {
      n++;
      key = `${base}_${n}`;
    }

    assigned.set(key, item.value);
    return { ...item, key };
  });
}
