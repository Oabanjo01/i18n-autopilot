/**
 * src/keyGenerator.ts — The labeller.
 * Takes each string the parser found and turns it into a clean key. "Welcome back!" → welcome_back.
 * These keys are what t() will reference.
 */

import { ExtractedString } from './parser';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on',
  'at', 'to', 'for', 'of', 'with', 'is', 'it', 'this',
]);

function toKey(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') 
    .trim()
    .split(/\s+/)                   
    .filter(w => w.length > 1)      
    .filter(w => !STOP_WORDS.has(w)) 
    .slice(0, 3);                    

  return words.join('_') || 'string';
}

export function generateKeys(extracted: ExtractedString[]): ExtractedString[] {
  const keyCounts = new Map<string, number>();

  return extracted.map((item) => {
    let key = toKey(item.value);

    if (keyCounts.has(key)) {
      const count = keyCounts.get(key)! + 1;
      keyCounts.set(key, count);
      key = `${key}_${count}`;
    } else {
      keyCounts.set(key, 1);
    }

    return { ...item, key };
  });
}