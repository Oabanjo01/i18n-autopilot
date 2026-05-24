#!/usr/bin/env node

import chalk from "chalk";
import { program } from "commander";
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
  markFileProcessed,
  saveTrackingData,
} from "../src/tracker";
import {
  buildDefaultRegistry,
  resolveProvider,
  ProviderCredentials,
} from "../src/providers/registry";
import {
  getMissingLocaleKeys,
  mergeTranslationsIntoLocaleFile,
} from "../src/providers/lingo";
import {
  loadCredential,
  saveCredential,
  migrateIfNeeded,
} from "../src/credentialStore";
import { ProviderError } from "../src/providers/types";
import { ClaudeProvider } from "../src/providers/claude";
import { DeepLProvider } from "../src/providers/deepl";
import { GoogleProvider } from "../src/providers/google";
import { OpenAIProvider } from "../src/providers/openai";
import { AWSProvider } from "../src/providers/aws";

program
  .name("i18n-autopilot")
  .description("Instant i18n for React Native codebases")
  .version("1.0.1")
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
        { name: "Lingo.dev (recommended)", value: "lingo" },
        { name: "DeepL", value: "deepl" },
        { name: "Google Translate", value: "google" },
        { name: "OpenAI (GPT-4o)", value: "openai" },
        { name: "Claude (Anthropic)", value: "claude" },
        { name: "AWS Translate", value: "aws" },
        { name: "Custom (use your own service)", value: "custom" },
      ],
      default: "lingo",
    },
    // Custom sub-menu — known services
    {
      type: "rawlist",
      name: "customService",
      message: "Which service do you want to use?",
      choices: [
        {
          name: "LibreTranslate (free, no key needed)",
          value: "libretranslate",
        },
        { name: "MyMemory (free, 5k words/day)", value: "mymemory" },
        { name: "Other (I'll provide my own file)", value: "other" },
      ],
      when: (ans: any) => ans.provider === "custom",
    },
    // Custom — LibreTranslate optional URL
    {
      type: "input",
      name: "libreTranslateUrl",
      message: "LibreTranslate instance URL (press Enter for public instance):",
      default: "https://libretranslate.com",
      when: (ans: any) =>
        ans.provider === "custom" && ans.customService === "libretranslate",
    },
    {
      type: "password",
      name: "libreTranslateApiKey",
      message:
        "LibreTranslate API key (press Enter to skip for public instance):",
      mask: "•",
      when: (ans: any) =>
        ans.provider === "custom" && ans.customService === "libretranslate",
    },
    // Custom — MyMemory optional email
    {
      type: "input",
      name: "myMemoryEmail",
      message:
        "Your email for MyMemory (press Enter to skip, limits to 5k words/day):",
      when: (ans: any) =>
        ans.provider === "custom" && ans.customService === "mymemory",
    },
    // Custom — Other: file path
    {
      type: "input",
      name: "customProviderPath",
      message: "Path to your custom provider JS file:",
      when: (ans: any) =>
        ans.provider === "custom" && ans.customService === "other",
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
    // DeepL API key
    {
      type: "password",
      name: "deeplApiKey",
      message: "DeepL API key:",
      mask: "•",
      when: (ans: any) => {
        if (ans.provider !== "deepl") return false;
        const saved = loadCredential("deepl");
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
  } else if (answers.provider === "deepl") {
    const saved = loadCredential("deepl");
    const apiKey = saved?.apiKey || answers.deeplApiKey;
    if (answers.deeplApiKey)
      saveCredential("deepl", { apiKey: answers.deeplApiKey });
    credentials.deepl = { apiKey };
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
  }

  // Handle custom provider — build and test before proceeding
  let customProvider: any = null;
  if (answers.provider === "custom") {
    if (answers.customService === "libretranslate") {
      const { LibreTranslateProvider } =
        await import("../src/providers/libretranslate");
      customProvider = new LibreTranslateProvider(
        answers.libreTranslateUrl || "https://libretranslate.com",
        answers.libreTranslateApiKey || "",
      );
    } else if (answers.customService === "mymemory") {
      const { MyMemoryProvider } = await import("../src/providers/mymemory");
      customProvider = new MyMemoryProvider(answers.myMemoryEmail || "");
    } else if (answers.customService === "other") {
      // Load from file path — existing flow
    }

    // Test the custom provider before proceeding
    if (customProvider) {
      const testSpinner = ora(
        `Testing ${customProvider.name} connection...`,
      ).start();
      try {
        const testResult = await customProvider.translate(
          { test: "Hello" },
          "en",
          "es",
        );
        if (testResult && typeof testResult.test === "string") {
          testSpinner.succeed(
            `${customProvider.name} connection verified ✔  ("Hello" → "${testResult.test}")`,
          );
          saveCredential(
            customProvider.name,
            answers.customService === "libretranslate"
              ? {
                  url:
                    answers.libreTranslateUrl || "https://libretranslate.com",
                  apiKey: answers.libreTranslateApiKey || "",
                }
              : { email: answers.myMemoryEmail || "" },
          );
        } else {
          testSpinner.fail(
            `${customProvider.name} returned an unexpected response`,
          );
          process.exit(1);
        }
      } catch (err: any) {
        testSpinner.fail(`${customProvider.name} test failed: ${err.message}`);
        log(
          chalk.yellow(
            "\n  Check your credentials or endpoint and try again.\n",
          ),
        );
        process.exit(1);
      }
    }
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
    keyed = generateKeys(extracted);
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
      if (customProvider) {
        // Custom known service — already tested, register directly
        registry.register(customProvider);
        provider = customProvider;
      } else {
        provider = await resolveProvider(
          registry,
          answers.provider,
          answers.customProviderPath,
        );
      }
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

      for (const locale of answers.locales) {
        const missingKeys = getMissingLocaleKeys(
          answers.projectPath,
          locale,
          enMap,
        );

        if (!missingKeys) {
          log(chalk.gray(`  ⏭  ${locale} — up to date, skipping`));
          continue;
        }

        if (options.dryRun) {
          log(
            chalk.gray(
              `  Dry run — would translate ${Object.keys(missingKeys).length} key(s) via ${provider.name} for ${locale}`,
            ),
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
        log(
          chalk.gray(
            `  ${isNew ? "🆕" : "➕"} ${locale} — translating ${Object.keys(missingKeys).length} key(s)`,
          ),
        );

        try {
          const translated = await provider.translate(
            missingKeys,
            "en",
            locale,
          );
          mergeTranslationsIntoLocaleFile(
            answers.projectPath,
            locale,
            translated,
          );
          log(chalk.green(`  ✔ ${locale} — done`));
        } catch (err: any) {
          log(chalk.red(`  ✘ ${locale} (${provider.name}) — ${err.message}`));
        }
      }
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
    if (options.deep) {
      const deepRewriteResults = rewriteDeepFiles({
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

    const trackingData = loadTrackingData(answers.projectPath);
    rewriteResults.forEach((result) => {
      if (result.modified) {
        const fileKeys = keyed
          .filter((k) => k.filePath === result.filePath)
          .map((k) => k.key);
        const fileContent = fs.readFileSync(result.filePath, "utf-8");
        markFileProcessed(trackingData, result.filePath, fileContent, fileKeys);
      }
    });
    saveTrackingData(answers.projectPath, trackingData, options.dryRun);

    const filesWithStrings = [...new Set(keyed.map((e: any) => e.filePath))];
    if (filesWithStrings.length > 0) {
      log(
        chalk.cyan(
          `\n  Files processed in this run: ${filesWithStrings.length}`,
        ),
      );
      filesWithStrings.forEach((f) => {
        const count = keyed.filter((e: any) => e.filePath === f).length;
        const relativePath = f.replace(answers.projectPath, ".");
        log(chalk.gray(`  ${count} strings — ${relativePath}`));
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
