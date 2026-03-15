#!/usr/bin/env ts-node

import { program } from "commander";
import fs from "fs";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { generateKeys } from "../src/keyGenerator";
import { scanProject } from "../src/scanner";
import { parseFiles } from "../src/parser";
import { buildLocaleFile } from "../src/localeBuilder";
import { rewriteFiles, ensureI18nDependencies } from "../src/rewriter";
import {
  runLingoTranslations,
  saveApiKey,
  loadApiKey,
} from "../src/lingoRunner";

program
  .name("i18n-autopilot")
  .description("Instant i18n for React Native codebases")
  .version("1.0.0")
  .option("--dry-run", "Preview changes without writing any files")
  .parse(process.argv);

const options = program.opts();

async function main() {
  console.log(chalk.bold.cyan("\n  i18n Autopilot\n"));

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

  fs.writeFileSync(
    "/tmp/i18n-autopilot-debug.json",
    JSON.stringify(
      {
        locales: answers.locales,
        projectPath: answers.projectPath,
        textComponents: answers.textComponents,
        hasApiKey: !!answers.apiKey,
      },
      null,
      2,
    ),
  );

  console.log("DEBUG answers.locales:", answers.locales);

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
    console.log(chalk.yellow("\n  Dry-run mode — no files will be written.\n"));
  }

  console.log(chalk.gray("\n  Config locked in:"));
  console.log(chalk.gray(`  Project    : ${answers.projectPath}`));
  console.log(chalk.gray(`  Locales    : ${answers.locales.join(", ")}`));
  console.log(chalk.gray(`  Components : ${textComponents.join(", ")}`));
  console.log(chalk.gray(`  Dry run    : ${options.dryRun ? "yes" : "no"}\n`));

  // Step 1 — Scan
  const scanSpinner = ora("Scanning project...").start();
  const files = scanProject(answers.projectPath);
  const components = files.filter((f) => f.fileType === "component");
  const hooks = files.filter((f) => f.fileType === "hook");
  scanSpinner.succeed(
    `Found ${files.length} files — ${components.length} components, ${hooks.length} hooks`,
  );

  // Step 2 — Parse
  const parseSpinner = ora("Parsing strings...").start();
  const extracted = parseFiles(files, textComponents);
  parseSpinner.succeed(`Found ${extracted.length} translatable strings`);

  // Step 3 — Generate keys
  const keySpinner = ora("Generating keys...").start();
  const keyed = generateKeys(extracted);
  keySpinner.succeed(`Generated ${keyed.length} keys`);

  // Step 4 — Build locale file
  const localeSpinner = ora("Building locale file...").start();
  const localeMap = buildLocaleFile(keyed, answers.projectPath, options.dryRun);
  localeSpinner.succeed(
    options.dryRun
      ? `Dry run — en.json preview (${Object.keys(localeMap).length} keys)`
      : `Written locales/en.json (${Object.keys(localeMap).length} keys)`,
  );

  console.log(chalk.cyan("\n  Running Lingo.dev translations...\n"));

  const success = await runLingoTranslations({
    projectPath: answers.projectPath,
    targetLocales: answers.locales,
    apiKey,
    dryRun: options.dryRun,
  });

  if (success) {
    console.log(chalk.green("\n  ✔ Translations complete"));
  } else {
    console.log(
      chalk.red("\n  ✘ Translation step failed — check errors above"),
    );
  }

  // Step 5 — Ensure i18n dependencies
  const depsReady = await ensureI18nDependencies(answers.projectPath);
  if (!depsReady) {
    console.log(
      chalk.red("  Cannot rewrite files without i18n dependencies. Exiting."),
    );
    process.exit(1);
  }

  // Step 6 — Rewrite source files
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
  
  const filesWithStrings = [...new Set(keyed.map((e) => e.filePath))];
  console.log(
    chalk.gray(
      `\n  Files with extractable strings: ${filesWithStrings.length}`,
    ),
  );
  filesWithStrings.forEach((f) => {
    const count = keyed.filter((e) => e.filePath === f).length;
    console.log(chalk.gray(`  ${count} strings — ${f}`));
  });
}

main().catch((err) => {
  console.error(chalk.red("Error:"), err.message);
  process.exit(1);
});
