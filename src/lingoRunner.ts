/**
 * src/lingoRunner.ts — Backward-compatible shim.
 * Core translation logic now lives in src/providers/lingo.ts.
 * This file is kept so bin/index.ts can continue importing
 * loadApiKey, saveApiKey, and runLingoTranslations unchanged.
 */

import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import { log } from "./reporter";
import { LingoProvider } from "./providers/lingo";
import {
  getMissingLocaleKeys,
  mergeTranslationsIntoLocaleFile,
} from "./providers/lingo";

const CONFIG_DIR = path.join(os.homedir(), ".i18n-autopilot");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function saveApiKey(apiKey: string): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ apiKey }, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function loadApiKey(): string | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return config.apiKey || null;
  } catch {
    return null;
  }
}

interface LingoRunnerOptions {
  projectPath: string;
  targetLocales: string[];
  apiKey: string;
  dryRun: boolean;
}

export async function runLingoTranslations(
  options: LingoRunnerOptions,
): Promise<boolean> {
  const { projectPath, targetLocales, apiKey, dryRun } = options;

  if (dryRun) {
    log(chalk.gray("  Dry run — skipping Lingo.dev CLI execution"));
    return true;
  }

  const enPath = path.join(path.resolve(projectPath), "locales", "en.json");

  if (!fs.existsSync(enPath)) {
    log(chalk.yellow("  No en.json found, skipping translations"));
    return true;
  }

  const enMap: Record<string, string> = JSON.parse(
    fs.readFileSync(enPath, "utf-8"),
  );

  if (Object.keys(enMap).length === 0) {
    log(chalk.yellow("  en.json is empty, skipping translations"));
    return true;
  }

  const provider = new LingoProvider(apiKey);

  for (const locale of targetLocales) {
    const missingKeys = getMissingLocaleKeys(projectPath, locale, enMap);

    if (!missingKeys) {
      log(chalk.gray(`  ⏭  ${locale} — up to date, skipping`));
      continue;
    }

    const isNew = !fs.existsSync(
      path.join(path.resolve(projectPath), "locales", `${locale}.json`),
    );

    log(
      chalk.gray(
        `  ${isNew ? "🆕" : "➕"} ${locale} — translating ${Object.keys(missingKeys).length} key(s)`,
      ),
    );

    try {
      const produced = await provider.translate(missingKeys, "en", locale);
      mergeTranslationsIntoLocaleFile(projectPath, locale, produced);
      log(chalk.green(`  ✔ ${locale} — done`));
    } catch (err: any) {
      log(chalk.red(`  ✘ ${locale} — ${err.message}`));
    }
  }

  return true;
}
