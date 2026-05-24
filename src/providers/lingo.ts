/**
 * src/providers/lingo.ts — Lingo.dev translation adapter.
 * Wraps the Lingo.dev CLI (temp-dir / spawn / merge) as a TranslationProvider.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawn } from "child_process";
import inquirer from "inquirer";
import chalk from "chalk";
import { log } from "../reporter";
import { TranslationProvider, ProviderError } from "./types";

// ---------------------------------------------------------------------------
// Private helpers (moved verbatim from src/lingoRunner.ts)
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const tempDir = path.join(os.tmpdir(), `lingo-run-${Date.now()}`);
  fs.mkdirSync(path.join(tempDir, "locales"), { recursive: true });
  return tempDir;
}

function deleteTempDir(tempDir: string): void {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Non-critical — temp files will be cleaned by OS eventually
  }
}

function writeLingoCLIConfig(dir: string, targetLocales: string[]): void {
  const config = {
    version: "1.15",
    locale: {
      source: "en",
      targets: targetLocales,
    },
    buckets: {
      json: {
        include: ["locales/[locale].json"],
      },
    },
    $schema: "https://lingo.dev/schema/i18n.json",
  };

  fs.writeFileSync(
    path.join(dir, "i18n.json"),
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

async function runLingoCLI(
  cwd: string,
  apiKey: string,
  targetLocales: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const localeFlags = targetLocales.flatMap((l) => ["--target-locale", l]);

    const lingo = spawn("lingo", ["run", ...localeFlags], {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        LINGO_API_KEY: apiKey,
      },
    });

    lingo.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Lingo.dev CLI exited with code ${code}`));
    });

    lingo.on("error", (err) => {
      reject(new Error(`Failed to spawn Lingo.dev CLI: ${err.message}`));
    });
  });
}

function isLingoInstalled(): boolean {
  try {
    execSync("lingo --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function ensureLingoInstalled(): Promise<boolean> {
  if (isLingoInstalled()) return true;

  const { permission } = await inquirer.prompt([
    {
      type: "confirm",
      name: "permission",
      message:
        "Lingo.dev CLI is not installed. Install it now? (npm install -g lingo.dev)",
      default: true,
    },
  ]);

  if (!permission) {
    log("\n  Install it manually with: npm install -g lingo.dev\n");
    return false;
  }

  try {
    execSync("npm install -g lingo.dev", { stdio: "inherit" });
    return true;
  } catch {
    log(chalk.red("  Failed to install Lingo.dev CLI automatically."));
    log(chalk.red("  Try manually: npm install -g lingo.dev\n"));
    return false;
  }
}

function cleanProjectLingoConfig(projectPath: string): void {
  const resolvedPath = path.resolve(projectPath);
  const configPath = path.join(resolvedPath, "i18n.json");
  const lockPath = path.join(resolvedPath, "i18n.lock");

  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}

// ---------------------------------------------------------------------------
// Private per-locale translation helper
// ---------------------------------------------------------------------------

async function runLingoForLocale(
  data: Record<string, string>,
  targetLocale: string,
  apiKey: string,
): Promise<Record<string, string>> {
  const tempDir = createTempDir();
  try {
    // Write source data as en.json
    fs.writeFileSync(
      path.join(tempDir, "locales", "en.json"),
      JSON.stringify(data, null, 2),
      "utf-8",
    );

    // Write Lingo CLI config
    writeLingoCLIConfig(tempDir, [targetLocale]);

    // Run the CLI
    await runLingoCLI(tempDir, apiKey, [targetLocale]);

    // Read the translated output
    const translatedPath = path.join(
      tempDir,
      "locales",
      `${targetLocale}.json`,
    );
    if (!fs.existsSync(translatedPath)) {
      throw new Error(`No output produced for locale "${targetLocale}"`);
    }
    const result: Record<string, string> = JSON.parse(
      fs.readFileSync(translatedPath, "utf-8"),
    );

    return result;
  } catch (err: unknown) {
    throw new ProviderError("lingo", err instanceof Error ? err : String(err));
  } finally {
    deleteTempDir(tempDir);
  }
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * Returns the subset of keys in `enMap` that are missing from the target
 * locale file, or `null` if the locale is already up to date.
 * Renamed from `getMissingKeys` in lingoRunner.ts for clarity.
 */
export function getMissingLocaleKeys(
  projectPath: string,
  locale: string,
  enMap: Record<string, string>,
): Record<string, string> | null {
  const filePath = path.join(
    path.resolve(projectPath),
    "locales",
    `${locale}.json`,
  );

  if (!fs.existsSync(filePath)) return enMap;

  const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const missingKeys = Object.keys(enMap).filter((key) => !(key in existing));

  if (missingKeys.length === 0) return null;

  return Object.fromEntries(missingKeys.map((key) => [key, enMap[key]]));
}

/**
 * Merges `newTranslations` into the existing locale file at
 * `<projectPath>/locales/<locale>.json`, creating the file if needed.
 * Renamed from `mergeIntoLocaleFile` in lingoRunner.ts for clarity.
 */
export function mergeTranslationsIntoLocaleFile(
  projectPath: string,
  locale: string,
  newTranslations: Record<string, string>,
): void {
  const filePath = path.join(
    path.resolve(projectPath),
    "locales",
    `${locale}.json`,
  );

  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
    : {};

  const merged = { ...existing, ...newTranslations };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
}

/**
 * Lingo.dev translation adapter.
 * Delegates to the Lingo.dev CLI via a temporary working directory.
 */
export class LingoProvider implements TranslationProvider {
  readonly name = "lingo";

  constructor(private readonly apiKey: string) {}

  async translate(
    data: Record<string, string>,
    _sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    if (Object.keys(data).length === 0) return {};

    const ready = await ensureLingoInstalled();
    if (!ready) {
      throw new ProviderError(
        "lingo",
        "Lingo.dev CLI is not installed and could not be installed automatically.",
      );
    }

    try {
      return await runLingoForLocale(data, targetLocale, this.apiKey);
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        "lingo",
        err instanceof Error ? err : String(err),
      );
    }
  }
}
