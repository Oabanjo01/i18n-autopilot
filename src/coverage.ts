/**
 * src/coverage.ts — Translation coverage check (`--check`).
 * Read-only: compares each locale file with locales/en.json and the recorded
 * translation sources. Needs no provider, credentials or prompts.
 */

import fs from "fs";
import path from "path";
import { getChangedLocaleKeys } from "./providers/localeFiles";
import { loadTranslationSources } from "./tracker";

export interface LocaleCoverage {
  locale: string;
  /** Keys in en.json that this locale has translated. */
  translated: number;
  /** Keys in en.json with no translation in this locale. */
  missing: string[];
  /** Keys in this locale that no longer exist in en.json. */
  stale: string[];
  /** Keys translated from English that has since changed. */
  outdated: string[];
  /** False when no translation sources are recorded, so outdated can't be detected. */
  sourcesTracked: boolean;
}

export interface CoverageReport {
  sourceKeys: number;
  locales: LocaleCoverage[];
  ok: boolean;
}

export class CoverageError extends Error {}

function readJsonFile(filePath: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new CoverageError(
      `Could not parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function discoverLocales(localesDir: string): string[] {
  return fs
    .readdirSync(localesDir)
    .filter((f) => f.endsWith(".json") && f !== "en.json" && !f.startsWith("."))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function checkCoverage(
  projectPath: string,
  locales?: string[],
): CoverageReport {
  const localesDir = path.join(path.resolve(projectPath), "locales");
  const enPath = path.join(localesDir, "en.json");
  if (!fs.existsSync(enPath)) {
    throw new CoverageError(
      `No locales/en.json in ${path.resolve(projectPath)} — run i18n-autopilot there first.`,
    );
  }

  const enMap = readJsonFile(enPath);
  const enKeys = Object.keys(enMap);
  const sources = loadTranslationSources(projectPath);
  const targetLocales =
    locales && locales.length > 0 ? locales : discoverLocales(localesDir);

  const results = targetLocales.map((locale): LocaleCoverage => {
    const localePath = path.join(localesDir, `${locale}.json`);
    const localeMap = fs.existsSync(localePath) ? readJsonFile(localePath) : {};

    const missing = enKeys.filter((k) => !(k in localeMap));
    const stale = Object.keys(localeMap).filter((k) => !(k in enMap));
    const outdated = Object.keys(
      getChangedLocaleKeys(projectPath, locale, enMap, sources[locale]),
    );

    return {
      locale,
      translated: enKeys.length - missing.length,
      missing,
      stale,
      outdated,
      sourcesTracked: sources[locale] !== undefined,
    };
  });

  return {
    sourceKeys: enKeys.length,
    locales: results,
    ok: results.every(
      (r) => r.missing.length === 0 && r.stale.length === 0 && r.outdated.length === 0,
    ),
  };
}

const LIST_LIMIT = 10;

function listKeys(label: string, keys: string[]): string[] {
  if (keys.length === 0) return [];
  const shown = keys.slice(0, LIST_LIMIT).map((k) => `    - ${k}`);
  const more =
    keys.length > LIST_LIMIT ? [`    …and ${keys.length - LIST_LIMIT} more`] : [];
  return [`  ${label}:`, ...shown, ...more];
}

export function formatCoverageReport(report: CoverageReport): string {
  const lines = [
    "i18n Coverage Report",
    "────────────────────────────────────",
    `  Source strings (en): ${report.sourceKeys} keys`,
  ];

  if (report.locales.length === 0) {
    lines.push("  No target locale files found in locales/.");
  }

  const width = Math.max(0, ...report.locales.map((r) => r.locale.length));
  for (const r of report.locales) {
    const pct =
      report.sourceKeys === 0 ? 100 : Math.floor((r.translated / report.sourceKeys) * 100);
    const problems = [
      r.missing.length && `${r.missing.length} missing`,
      r.outdated.length && `${r.outdated.length} outdated`,
      r.stale.length && `${r.stale.length} stale`,
    ].filter(Boolean);
    const icon = problems.length === 0 ? "✅" : r.missing.length > 0 ? "❌" : "⚠️ ";
    lines.push(
      `  ${r.locale.padEnd(width)}  ${`${r.translated}/${report.sourceKeys}`.padStart(9)}  ${icon} ${String(pct).padStart(3)}%` +
        (problems.length ? `  — ${problems.join(", ")}` : ""),
    );
  }

  for (const r of report.locales) {
    const details = [
      ...listKeys(`Missing in ${r.locale}`, r.missing),
      ...listKeys(`Outdated in ${r.locale} (English changed since translation)`, r.outdated),
      ...listKeys(`Stale in ${r.locale} (no longer in en.json)`, r.stale),
    ];
    if (details.length) lines.push("", ...details);
  }

  const untracked = report.locales.filter((r) => !r.sourcesTracked);
  if (untracked.length > 0) {
    lines.push(
      "",
      `  Note: no translation sources recorded for ${untracked.map((r) => r.locale).join(", ")}, ` +
        "so outdated translations can't be detected there. Run i18n-autopilot once to start tracking.",
    );
  }

  const hasMissingOrOutdated = report.locales.some(
    (r) => r.missing.length > 0 || r.outdated.length > 0,
  );
  const hasStale = report.locales.some((r) => r.stale.length > 0);
  lines.push("");
  if (report.ok) lines.push("  All locales are up to date.");
  if (hasMissingOrOutdated) {
    lines.push("  Run i18n-autopilot to translate missing and outdated keys.");
  }
  if (hasStale) {
    lines.push("  Stale keys are safe to delete from the locale files.");
  }

  return lines.join("\n");
}
