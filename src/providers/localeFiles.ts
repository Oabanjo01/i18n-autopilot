/**
 * src/providers/localeFiles.ts — Provider-agnostic locale file helpers.
 * Diffs en.json against a target locale and merges translated output back.
 */

import fs from "fs";
import path from "path";

function localeFilePath(projectPath: string, locale: string): string {
  return path.join(path.resolve(projectPath), "locales", `${locale}.json`);
}

/**
 * Returns the subset of keys in `enMap` that are missing from the target
 * locale file, or `null` if the locale is already up to date.
 */
export function getMissingLocaleKeys(
  projectPath: string,
  locale: string,
  enMap: Record<string, string>,
): Record<string, string> | null {
  const filePath = localeFilePath(projectPath, locale);

  if (!fs.existsSync(filePath)) return enMap;

  const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const missingKeys = Object.keys(enMap).filter((key) => !(key in existing));

  if (missingKeys.length === 0) return null;

  return Object.fromEntries(missingKeys.map((key) => [key, enMap[key]]));
}

function readLocaleFile(
  projectPath: string,
  locale: string,
): Record<string, string> | null {
  const filePath = localeFilePath(projectPath, locale);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Returns keys already translated in the target locale whose English text has
 * changed since that translation was made, according to `sources`.
 * Keys with no recorded source text are treated as unchanged.
 */
export function getChangedLocaleKeys(
  projectPath: string,
  locale: string,
  enMap: Record<string, string>,
  sources: Record<string, string> | undefined,
): Record<string, string> {
  const existing = readLocaleFile(projectPath, locale);
  if (!existing || !sources) return {};

  return Object.fromEntries(
    Object.keys(enMap)
      .filter(
        (key) =>
          key in existing && key in sources && sources[key] !== enMap[key],
      )
      .map((key) => [key, enMap[key]]),
  );
}

/**
 * Returns the updated source record for a locale: `translatedKeys` now point at
 * their current English text, and keys present in the locale file with no
 * record yet are baselined to the current English. Changed keys that were not
 * re-translated keep their old source so they are flagged again next run.
 */
export function updateTranslationSources(
  projectPath: string,
  locale: string,
  enMap: Record<string, string>,
  sources: Record<string, string> | undefined,
  translatedKeys: string[],
): Record<string, string> {
  const updated = { ...(sources ?? {}) };
  const existing = readLocaleFile(projectPath, locale) ?? {};

  for (const key of Object.keys(existing)) {
    if (key in enMap && !(key in updated)) updated[key] = enMap[key];
  }
  for (const key of translatedKeys) {
    if (key in enMap) updated[key] = enMap[key];
  }
  return updated;
}

/**
 * Merges `newTranslations` into `<projectPath>/locales/<locale>.json`,
 * creating the file if needed.
 */
export function mergeTranslationsIntoLocaleFile(
  projectPath: string,
  locale: string,
  newTranslations: Record<string, string>,
): void {
  const filePath = localeFilePath(projectPath, locale);

  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
    : {};

  const merged = { ...existing, ...newTranslations };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
}
