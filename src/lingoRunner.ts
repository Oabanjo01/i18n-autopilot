/**
 * src/lingoRunner.ts — The translator. 
 * Calls the Lingo.dev REST API with your en.json and gets back es.json, fr.json etc. One API call per target language.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawn } from "child_process";
import inquirer from "inquirer";
import chalk from "chalk";
import { log } from "./reporter";

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

function getMissingKeys(
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

function mergeIntoLocaleFile(
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

  const ready = await ensureLingoInstalled();
  if (!ready) return false;

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

  cleanProjectLingoConfig(projectPath);

  for (const locale of targetLocales) {
    const missingKeys = getMissingKeys(projectPath, locale, enMap);

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

    const tempDir = createTempDir();

    try {
      fs.writeFileSync(
        path.join(tempDir, "locales", "en.json"),
        JSON.stringify(missingKeys, null, 2),
        "utf-8",
      );

      writeLingoCLIConfig(tempDir, [locale]);

      await runLingoCLI(tempDir, apiKey, [locale]);

      const translatedPath = path.join(tempDir, "locales", `${locale}.json`);
      if (fs.existsSync(translatedPath)) {
        const produced = JSON.parse(fs.readFileSync(translatedPath, "utf-8"));
        mergeIntoLocaleFile(projectPath, locale, produced);
        log(chalk.green(`  ✔ ${locale} — done`));
      } else {
        log(chalk.yellow(`  ⚠️  ${locale} — no output produced`));
      }
    } catch (err: any) {
      log(chalk.red(`  ✘ ${locale} — ${err.message}`));
    } finally {
      deleteTempDir(tempDir);
    }
  }

  cleanProjectLingoConfig(projectPath);

  return true;
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