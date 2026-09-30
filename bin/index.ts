#!/usr/bin/env node

import chalk from "chalk";
import { program } from "commander";
import { version } from "../package.json";
import fs from "fs";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { generateKeys } from "../src/keyGenerator";
import { buildLocaleFile } from "../src/localeBuilder";
import { parseFiles } from "../src/parser";
import { deepAnalyzeFiles } from "../src/deepAnalyzer";
import { getLogPath, initLog, log } from "../src/reporter";
import {
  ensureI18nDependencies,
  rewriteFiles,
  rewriteDeepFiles,
} from "../src/rewriter";
import { scanProjectSmart } from "../src/scanner";
import {
  loadTrackingData,
  loadTranslationSources,
  markFileProcessed,
  saveTrackingData,
  saveTranslationSources,
} from "../src/tracker";
import {
  buildDefaultRegistry,
  resolveProvider,
  ProviderCredentials,
} from "../src/providers/registry";
import {
  getChangedLocaleKeys,
  getMissingLocaleKeys,
  mergeTranslationsIntoLocaleFile,
  updateTranslationSources,
} from "../src/providers/localeFiles";
import {
  loadCredential,
  saveCredential,
  migrateIfNeeded,
} from "../src/credentialStore";
import { ProviderError } from "../src/providers/types";

program
  .name("i18n-autopilot")
  .description("Instant i18n for React Native codebases")
  .version(version)
  .option("--dry-run", "Preview changes without writing any files")
  .option("--deep", "Enable deep object/array/Map string extraction")
  .parse(process.argv);

const options = program.opts();

async function main() {
  log(chalk.bold.cyan("\n  i18n Autopilot\n"));

  migrateIfNeeded();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const answers: any = await (inquirer.prompt as any)([
    {
      type: "input",
      name: "projectPath",
      message: "Path to your React Native project:",
      default: ".",
    },
    {
      type: "checkbox",
      name: "locales",
      message: "Target languages:",
      choices: [
        { name: "Spanish", value: "es" },
        { name: "French", value: "fr-FR" },
        { name: "German", value: "de-DE" },
        { name: "Japanese", value: "ja-JP" },
        { name: "Hausa", value: "ha" },
        { name: "Portuguese", value: "pt-BR" },
        { name: "Chinese Simplified", value: "zh-CN" },
        { name: "Arabic", value: "ar-SA" },
      ],
      validate: (input: string[]) => {
        if (input.length === 0)
          return "Use Space to select languages, then Enter to confirm.";
        return true;
      },
    },
    {
      type: "input",
      name: "textComponents",
      message:
        "Custom Text component names (comma-separated, press enter to skip):",
      default: "",
    },
    {
      type: "rawlist",
      name: "provider",
      message: "Translation provider:",
      choices: [
        { name: "Lingo.dev", value: "lingo" },
        { name: "Google Translate", value: "google" },
        { name: "OpenAI (GPT-4o)", value: "openai" },
        { name: "Claude (Anthropic)", value: "claude" },
        { name: "AWS Translate", value: "aws" },
        {
          name: "LibreTranslate (free, self-hostable)",
          value: "libretranslate",
        },
        { name: "MyMemory (free, 5k words/day)", value: "mymemory" },
        { name: "Custom (provide your own JS file)", value: "custom" },
      ],
    },
    // LibreTranslate credentials
    {
      type: "input",
      name: "libreTranslateUrl",
      message: "LibreTranslate instance URL (press Enter for public instance):",
      default: "https://libretranslate.com",
      when: (ans: any) =>
        ans.provider === "libretranslate" && !loadCredential("libretranslate"),
    },
    {
      type: "password",
      name: "libreTranslateApiKey",
      message:
        "LibreTranslate API key (press Enter to skip for public instance):",
      mask: "•",
      when: (ans: any) =>
        ans.provider === "libretranslate" && !loadCredential("libretranslate"),
    },
    // MyMemory credentials
    {
      type: "input",
      name: "myMemoryEmail",
      message:
        "Your email for MyMemory (optional, raises daily limit to 50k words):",
      when: (ans: any) =>
        ans.provider === "mymemory" && !loadCredential("mymemory"),
    },
    // Custom — path to a JS file that exports a TranslationProvider
    {
      type: "input",
      name: "customProviderPath",
      message: "Path to your custom provider JS file:",
      when: (ans: any) => ans.provider === "custom",
      validate: (input: string) => {
        const trimmed = input.trim();
        if (!trimmed) return "Enter the path to a JS file that exports your provider.";
        if (!fs.existsSync(path.resolve(trimmed)))
          return `No file found at ${path.resolve(trimmed)}`;
        return true;
      },
      filter: (input: string) => input.trim(),
    },
    // Lingo.dev API key
    {
      type: "password",
      name: "lingoApiKey",
      message: "Lingo.dev API key:",
      mask: "•",
      when: (ans: any) => {
        if (ans.provider !== "lingo") return false;
        const saved = loadCredential("lingo");
        return !saved?.apiKey;
      },
    },
    // Google API key
    {
      type: "password",
      name: "googleApiKey",
      message: "Google Cloud Translation API key:",
      mask: "•",
      when: (ans: any) => {
        if (ans.provider !== "google") return false;
        const saved = loadCredential("google");
        return !saved?.apiKey;
      },
    },
    // OpenAI API key
    {
      type: "password",
      name: "openaiApiKey",
      message: "OpenAI API key:",
      mask: "•",
      when: (ans: any) => {
        if (ans.provider !== "openai") return false;
        const saved = loadCredential("openai");
        return !saved?.apiKey;
      },
    },
    // Claude API key
    {
      type: "password",
      name: "claudeApiKey",
      message: "Anthropic API key:",
      mask: "•",
      when: (ans: any) => {
        if (ans.provider !== "claude") return false;
        const saved = loadCredential("claude");
        return !saved?.apiKey;
      },
    },
    // AWS credentials
    {
      type: "input",
      name: "awsAccessKeyId",
      message: "AWS Access Key ID:",
      when: (ans: any) => {
        if (ans.provider !== "aws") return false;
        const saved = loadCredential("aws");
        return !saved?.accessKeyId;
      },
    },
    {
      type: "password",
      name: "awsSecretAccessKey",
      message: "AWS Secret Access Key:",
      mask: "•",
      when: (ans: any) => {
        if (ans.provider !== "aws") return false;
        const saved = loadCredential("aws");
        return !saved?.secretAccessKey;
      },
    },
    {
      type: "input",
      name: "awsRegion",
      message: "AWS Region:",
      default: "us-east-1",
      when: (ans: any) => {
        if (ans.provider !== "aws") return false;
        const saved = loadCredential("aws");
        return !saved?.region;
      },
    },
  ]);

  // Resolve credentials (use saved or newly entered)
  const credentials: ProviderCredentials = {};

  if (answers.provider === "lingo") {
    const saved = loadCredential("lingo");
    const apiKey = saved?.apiKey || answers.lingoApiKey;
    if (answers.lingoApiKey)
      saveCredential("lingo", { apiKey: answers.lingoApiKey });
    credentials.lingo = { apiKey };
  } else if (answers.provider === "google") {
    const saved = loadCredential("google");
    const apiKey = saved?.apiKey || answers.googleApiKey;
    if (answers.googleApiKey)
      saveCredential("google", { apiKey: answers.googleApiKey });
    credentials.google = { apiKey };
  } else if (answers.provider === "openai") {
    const saved = loadCredential("openai");
    const apiKey = saved?.apiKey || answers.openaiApiKey;
    if (answers.openaiApiKey)
      saveCredential("openai", { apiKey: answers.openaiApiKey });
    credentials.openai = { apiKey };
  } else if (answers.provider === "claude") {
    const saved = loadCredential("claude");
    const apiKey = saved?.apiKey || answers.claudeApiKey;
    if (answers.claudeApiKey)
      saveCredential("claude", { apiKey: answers.claudeApiKey });
    credentials.claude = { apiKey };
  } else if (answers.provider === "aws") {
    const saved = loadCredential("aws");
    const accessKeyId = saved?.accessKeyId || answers.awsAccessKeyId;
    const secretAccessKey =
      saved?.secretAccessKey || answers.awsSecretAccessKey;
    const region = saved?.region || answers.awsRegion;
    if (answers.awsAccessKeyId || answers.awsSecretAccessKey) {
      saveCredential("aws", { accessKeyId, secretAccessKey, region });
    }
    credentials.aws = { accessKeyId, secretAccessKey, region };
  } else if (answers.provider === "libretranslate") {
    const saved = loadCredential("libretranslate");
    const url =
      saved?.url || answers.libreTranslateUrl || "https://libretranslate.com";
    const apiKey = saved?.apiKey ?? answers.libreTranslateApiKey ?? "";
    if (!saved) saveCredential("libretranslate", { url, apiKey });
    credentials.libretranslate = { url, apiKey };
  } else if (answers.provider === "mymemory") {
    const saved = loadCredential("mymemory");
    const email = saved?.email ?? answers.myMemoryEmail ?? "";
    if (!saved) saveCredential("mymemory", { email });
    credentials.mymemory = { email };
  }

  // Build the final list of Text component names to look for
  const customComponents = answers.textComponents
    ? answers.textComponents
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];
  const textComponents: string[] = ["Text", ...customComponents];

  if (options.dryRun) {
    log(chalk.yellow("\n  Dry-run mode — no files will be written.\n"));
  }

  log(chalk.gray("\n  Config locked in:"));
  log(chalk.gray(`  Project    : ${answers.projectPath}`));
  log(chalk.gray(`  Locales    : ${answers.locales.join(", ")}`));
  log(chalk.gray(`  Components : ${textComponents.join(", ")}`));
  log(chalk.gray(`  Provider   : ${answers.provider}`));
  log(chalk.gray(`  Dry run    : ${options.dryRun ? "yes" : "no"}\n`));

  // Step 1 — Smart Scan
  const scanSpinner = ora("Scanning project...").start();
  const scanResult = scanProjectSmart(answers.projectPath);
  const { allFiles, filesToProcess, stats } = scanResult;

  const components = allFiles.filter((f) => f.fileType === "component");
  const hooks = allFiles.filter((f) => f.fileType === "hook");

  scanSpinner.succeed(
    `Found ${stats.total} files (${components.length} components, ${hooks.length} hooks) — ${stats.new} new, ${stats.modified} modified, ${stats.unchanged} unchanged`,
  );

  let keyed: any[] = [];
  let localeMap: Record<string, string> = {};

  // Only do extraction/keying/locale-building if there are files to process
  if (filesToProcess.length > 0) {
    // Step 2 — Parse ONLY files that need processing
    const parseSpinner = ora(
      "Parsing strings from new/modified files...",
    ).start();
    let extracted = parseFiles(filesToProcess, textComponents);
    parseSpinner.succeed(
      `Found ${extracted.length} translatable strings in ${filesToProcess.length} files`,
    );

    // Step 2b — Deep analysis (opt-in via --deep)
    if (options.deep) {
      log(
        chalk.cyan(
          "\n  Deep mode active — analyzing object/array/Map strings...\n",
        ),
      );
      const deepResult = deepAnalyzeFiles(filesToProcess, {
        textComponents,
        dryRun: options.dryRun,
      });
      extracted.push(...deepResult.extracted);
      if (deepResult.stats.translatablePropertiesFound > 0) {
        log(
          chalk.gray(
            `  Deep analysis: ${deepResult.stats.sourceObjectsAnalyzed} source objects analyzed, ${deepResult.stats.translatablePropertiesFound} additional strings found`,
          ),
        );
      }
      if (deepResult.skippedFiles.length > 0) {
        log(
          chalk.yellow(
            `  Deep analysis: ${deepResult.skippedFiles.length} file(s) skipped — see log for details`,
          ),
        );
        deepResult.skippedFiles.forEach((s) =>
          log(chalk.gray(`    ⚠️  ${s.filePath}: ${s.reason}`)),
        );
      }
      if (
        deepResult.stats.translatablePropertiesFound === 0 &&
        deepResult.skippedFiles.length === 0
      ) {
        log(
          chalk.gray("  Deep analysis: no object/array/Map strings found.\n"),
        );
      }
    }

    // Step 3 — Generate keys
    const keySpinner = ora("Generating keys...").start();
    const existingEnPath = path.join(
      path.resolve(answers.projectPath),
      "locales",
      "en.json",
    );
    let existingEn: Record<string, string> = {};
    try {
      if (fs.existsSync(existingEnPath)) {
        existingEn = JSON.parse(fs.readFileSync(existingEnPath, "utf-8"));
      }
    } catch {
      // buildLocaleFile warns about an unparseable en.json below
    }
    keyed = generateKeys(extracted, existingEn);
    keySpinner.succeed(`Generated ${keyed.length} keys`);

    // Step 4 — Build locale file (with merge logic) only if there are new keys
    if (keyed.length > 0) {
      const localeSpinner = ora("Building locale file...").start();
      localeMap = buildLocaleFile(keyed, answers.projectPath, options.dryRun);
      localeSpinner.succeed(
        options.dryRun
          ? `Dry run — en.json preview (${Object.keys(localeMap).length} keys)`
          : `Updated locales/en.json (${Object.keys(localeMap).length} keys)`,
      );
    } else {
      // No new strings found, load existing en.json
      const enPath = path.join(
        path.resolve(answers.projectPath),
        "locales",
        "en.json",
      );
      if (fs.existsSync(enPath)) {
        localeMap = JSON.parse(fs.readFileSync(enPath, "utf-8"));
        log(
          chalk.gray(
            `\n  No new strings found. Using existing en.json with ${Object.keys(localeMap).length} keys.`,
          ),
        );
      }
    }
  } else {
    // No new files to process, load existing en.json for translation
    const enPath = path.join(
      path.resolve(answers.projectPath),
      "locales",
      "en.json",
    );
    if (fs.existsSync(enPath)) {
      localeMap = JSON.parse(fs.readFileSync(enPath, "utf-8"));
      log(
        chalk.gray(
          `\n  No new files to process. Using existing en.json with ${Object.keys(localeMap).length} keys.`,
        ),
      );
    } else {
      log(
        chalk.green(
          "\n  ✔ All files are up to date and no translations needed.",
        ),
      );
      log(chalk.gray(`\n  Full log saved to: ${getLogPath()}`));
      process.exit(0);
    }
  }

  // Step 5 — Run translations
  if (answers.locales.length > 0 && Object.keys(localeMap).length > 0) {
    const registry = buildDefaultRegistry(credentials);
    let provider;
    try {
      provider = await resolveProvider(
        registry,
        answers.provider,
        answers.customProviderPath,
      );
    } catch (err: any) {
      log(chalk.red(`\n  ✘ Failed to load provider: ${err.message}`));
      process.exit(1);
    }

    log(chalk.cyan(`\n  Running translations via ${provider.name}...\n`));

    const enPath = path.join(
      path.resolve(answers.projectPath),
      "locales",
      "en.json",
    );
    if (!fs.existsSync(enPath)) {
      log(chalk.yellow("  No en.json found, skipping translations"));
    } else {
      const enMap: Record<string, string> = JSON.parse(
        fs.readFileSync(enPath, "utf-8"),
      );

      const sources = loadTranslationSources(answers.projectPath);

      const changedByLocale: Record<string, Record<string, string>> = {};
      for (const locale of answers.locales) {
        changedByLocale[locale] = getChangedLocaleKeys(
          answers.projectPath,
          locale,
          enMap,
          sources[locale],
        );
      }
      const changedKeyCount = new Set(
        Object.values(changedByLocale).flatMap((c) => Object.keys(c)),
      ).size;

      let retranslateChanged = false;
      if (changedKeyCount > 0 && !options.dryRun) {
        const { retranslate } = await (inquirer.prompt as any)([
          {
            type: "confirm",
            name: "retranslate",
            message: `${changedKeyCount} English string(s) changed since they were last translated. Re-translate them? (No keeps the existing translations and saves tokens; you'll be asked again next run.)`,
            default: true,
          },
        ]);
        retranslateChanged = retranslate;
      }

      for (const locale of answers.locales) {
        const missingKeys =
          getMissingLocaleKeys(answers.projectPath, locale, enMap) ?? {};
        const changedKeys = changedByLocale[locale];
        const missingCount = Object.keys(missingKeys).length;
        const changedCount = Object.keys(changedKeys).length;
        const toTranslate = retranslateChanged
          ? { ...missingKeys, ...changedKeys }
          : missingKeys;
        const toTranslateCount = Object.keys(toTranslate).length;

        if (options.dryRun) {
          if (missingCount === 0 && changedCount === 0) {
            log(chalk.gray(`  ⏭  ${locale} — up to date, skipping`));
          } else {
            log(
              chalk.gray(
                `  Dry run — would translate ${missingCount} new key(s)` +
                  (changedCount > 0
                    ? ` and ask about ${changedCount} changed key(s)`
                    : "") +
                  ` via ${provider.name} for ${locale}`,
              ),
            );
          }
          continue;
        }

        if (toTranslateCount === 0) {
          const note =
            changedCount > 0
              ? `${changedCount} changed key(s) kept as-is`
              : "up to date";
          log(chalk.gray(`  ⏭  ${locale} — ${note}, skipping`));
          sources[locale] = updateTranslationSources(
            answers.projectPath,
            locale,
            enMap,
            sources[locale],
            [],
          );
          continue;
        }

        const isNew = !fs.existsSync(
          path.join(
            path.resolve(answers.projectPath),
            "locales",
            `${locale}.json`,
          ),
        );
        const changedNote =
          retranslateChanged && changedCount > 0
            ? ` (${changedCount} re-translated)`
            : "";
        log(
          chalk.gray(
            `  ${isNew ? "🆕" : "➕"} ${locale} — translating ${toTranslateCount} key(s)${changedNote}`,
          ),
        );

        try {
          const translated = await provider.translate(
            toTranslate,
            "en",
            locale,
          );
          mergeTranslationsIntoLocaleFile(
            answers.projectPath,
            locale,
            translated,
          );
          sources[locale] = updateTranslationSources(
            answers.projectPath,
            locale,
            enMap,
            sources[locale],
            Object.keys(translated),
          );
          log(chalk.green(`  ✔ ${locale} — done`));
        } catch (err: any) {
          log(chalk.red(`  ✘ ${locale} (${provider.name}) — ${err.message}`));
        }
      }

      saveTranslationSources(answers.projectPath, sources, options.dryRun);
    }
  }

  // Step 6 — Rewrite and track (only if we processed files)
  if (filesToProcess.length > 0) {
    const depsReady = await ensureI18nDependencies(answers.projectPath);
    if (!depsReady) {
      log(
        chalk.red("  Cannot rewrite files without i18n dependencies. Exiting."),
      );
      process.exit(1);
    }

    const rewriteSpinner = ora("Rewriting source files...").start();
    const rewriteResults = rewriteFiles({
      projectPath: answers.projectPath,
      extracted: keyed,
      textComponents,
      dryRun: options.dryRun,
    });
    const modifiedCount = rewriteResults.filter((r) => r.modified).length;
    const skippedCount = rewriteResults.filter((r) => r.skipped).length;
    rewriteSpinner.succeed(
      `Rewrote ${modifiedCount} files, skipped ${skippedCount}`,
    );

    // Step 6b — Deep rewrite (only in deep mode)
    let deepRewriteResults: typeof rewriteResults = [];
    if (options.deep) {
      deepRewriteResults = rewriteDeepFiles({
        projectPath: answers.projectPath,
        extracted: keyed,
        textComponents,
        dryRun: options.dryRun,
      });
      const deepModified = deepRewriteResults.filter((r) => r.modified).length;
      const deepSkipped = deepRewriteResults.filter((r) => r.skipped).length;
      if (deepModified > 0 || deepSkipped > 0) {
        log(
          chalk.gray(
            `  Deep rewrite: ${deepModified} files rewritten, ${deepSkipped} skipped`,
          ),
        );
      }
    }

    // Files that failed to parse stay unmarked so the next run retries them.
    const failedFiles = new Set(
      [...rewriteResults, ...deepRewriteResults]
        .filter((r) => r.reason?.startsWith("Parse error"))
        .map((r) => r.filePath),
    );
    const trackingData = loadTrackingData(answers.projectPath);
    for (const file of filesToProcess) {
      if (failedFiles.has(file.filePath)) continue;
      const fileKeys = keyed
        .filter((k) => k.filePath === file.filePath)
        .map((k) => k.key);
      const fileContent = fs.readFileSync(file.filePath, "utf-8");
      markFileProcessed(trackingData, file.filePath, fileContent, fileKeys);
    }
    saveTrackingData(answers.projectPath, trackingData, options.dryRun);

    const filesWithStrings = [...new Set(keyed.map((e: any) => e.filePath))];
    if (filesWithStrings.length > 0) {
      log(
        chalk.cyan(
          `\n  Files processed in this run: ${filesWithStrings.length}`,
        ),
      );
      const absProjectPath = path.resolve(answers.projectPath);
      filesWithStrings.forEach((f) => {
        const count = keyed.filter((e: any) => e.filePath === f).length;
        const relativePath = path.relative(absProjectPath, f);
        log(chalk.gray(`  ${count} strings — ./${relativePath}`));
      });
    }
  }

  log(chalk.gray(`\n  Full log saved to: ${getLogPath()}`));
  log(chalk.green("\n  ✨ Done!\n"));
  process.exit(0);
}

initLog();

main().catch((err) => {
  log(chalk.red(`\n  Error: ${err.message}`));
  process.exit(1);
});
