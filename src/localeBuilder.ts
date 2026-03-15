/**
 * src/localeBuilder.ts — The archivist. 
 * Takes the full key map and writes it to locales/en.json. 
 * This is the file Lingo.dev will read and translate.
 */

import fs from 'fs';
import path from 'path';
import { ExtractedString } from './parser';

export function buildLocaleFile(
  extracted: ExtractedString[],
  projectPath: string,
  dryRun: boolean
): Record<string, string> {
  // Build the key → value map
  const localeMap: Record<string, string> = {};

  for (const item of extracted) {
    localeMap[item.key] = item.value;
  }

  if (!dryRun) {
    const localesDir = path.join(path.resolve(projectPath), 'locales');
    const outputPath = path.join(localesDir, 'en.json');

    if (!fs.existsSync(localesDir)) {
      fs.mkdirSync(localesDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(localeMap, null, 2), 'utf-8');
  }

  return localeMap;
}