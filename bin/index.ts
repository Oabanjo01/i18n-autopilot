#!/usr/bin/env node

import chalk from "chalk";
import { program } from "commander";
import fs from "fs";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { generateKeys } from "../src/keyGenerator";
import {
  loadApiKey,
  runLingoTranslations,
  saveApiKey,
} from "../src/lingoRunner";
import { buildLocaleFile } from "../src/localeBuilder";
import { parseFiles } from "../src/parser";
import { getLogPath, initLog, log } from "../src/reporter";
import { ensureI18nDependencies, rewriteFiles } from "../src/rewriter";
import { scanProjectSmart } from "../src/scanner";
import {
  loadTrackingData,
  markFileProcessed,
  saveTrackingData,
} from "../src/tracker";

program
  .name("i18n-autopilot")
  .description("Instant i18n for React Native codebases")
  .version("1.0.0")
  .option("--dry-run", "Preview changes without writing any files")
  .parse(process.argv);

const options = program.opts();

async function main() {
  log(chalk.bold.cyan("\n  i18n Autopilot\n"));

  const savedApiKey = loadApiKey();

  const answers = await inquirer.prompt([
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
      type: "password",
      name: "apiKey",
      message: "Lingo.dev API key:",
      mask: "•",
      when: () => !savedApiKey,
    },
  ]);

  // Resolve API key
  const apiKey = savedApiKey || answers.apiKey;
  if (answers.apiKey) saveApiKey(answers.apiKey);

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
    const extracted = parseFiles(filesToProcess, textComponents);
    parseSpinner.succeed(
      `Found ${extracted.length} translatable strings in ${filesToProcess.length} files`,
    );

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
    log(chalk.cyan("\n  Running Lingo.dev translations...\n"));

    const success = await runLingoTranslations({
      projectPath: answers.projectPath,
      targetLocales: answers.locales,
      apiKey,
      dryRun: options.dryRun,
    });

    if (success) {
      log(chalk.green("\n  ✔ Translations complete"));
    } else {
      log(chalk.red("\n  ✘ Translation step failed — check errors above"));
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
