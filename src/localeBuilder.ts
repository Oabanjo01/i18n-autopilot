/**
 * src/localeBuilder.ts — The archivist. 
 * Takes the full key map and writes it to locales/en.json. 
 * This is the file Lingo.dev will read and translate.
 */

import fs from 'fs';
import path from 'path';
import { ExtractedString } from './parser';
import chalk from 'chalk';
import { log } from './reporter';

export function buildLocaleFile(
  extracted: ExtractedString[],
  projectPath: string,
  dryRun: boolean
): Record<string, string> {
  const localesDir = path.join(path.resolve(projectPath), 'locales');
  const outputPath = path.join(localesDir, 'en.json');

  let existingTranslations: Record<string, string> = {};
  if (fs.existsSync(outputPath)) {
    try {
      const content = fs.readFileSync(outputPath, 'utf-8');
      existingTranslations = JSON.parse(content);
      log(chalk.gray(`  Found ${Object.keys(existingTranslations).length} existing translations in en.json`));
    } catch (err) {
      log(chalk.yellow('  Warning: Could not parse existing en.json, starting fresh'));
    }
  }

  const localeMap: Record<string, string> = { ...existingTranslations };
  
  let newKeysAdded = 0;
  for (const item of extracted) {
    if (!localeMap[item.key]) {
      localeMap[item.key] = item.value;
      newKeysAdded++;
    }
  }

  if (!dryRun && Object.keys(localeMap).length > 0) {
    if (!fs.existsSync(localesDir)) {
      fs.mkdirSync(localesDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(localeMap, null, 2), 'utf-8');
  }

  if (newKeysAdded > 0) {
    log(chalk.gray(`  Added ${newKeysAdded} new translation keys`));
  }
  if (Object.keys(existingTranslations).length > 0 && newKeysAdded === 0) {
    log(chalk.gray(`  No new keys to add, preserved all existing translations`));
  }


  return localeMap;
}

// Development purposes only
// export function watchEnJson(projectPath: string): void {
//   const enPath = path.join(path.resolve(projectPath), 'locales', 'en.json');
  
//   // Only watch if file exists
//   if (!fs.existsSync(enPath)) {
//     return;
//   }
  
//   fs.watchFile(enPath, { interval: 500 }, (curr, prev) => {
//     if (curr.size < prev.size) {
//       log(chalk.red('\n  ⚠️  en.json was modified externally!'));
//       log(chalk.red(`  Size before: ${prev.size} bytes`));
//       log(chalk.red(`  Size after: ${curr.size} bytes`));
//       console.trace();
//     }
//   });
// }