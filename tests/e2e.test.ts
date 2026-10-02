/**
 * End-to-end: runs the real CLI against a copy of the scenario fixture
 * (tests/fixtures/deep-analyzer-sample) with scripted answers and an offline
 * fake provider. Tests run in order and build on each other's state, like a
 * project across several runs.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import * as babelParser from "@babel/parser";
import traverse from "@babel/traverse";

const FIXTURE = path.join(__dirname, "fixtures/deep-analyzer-sample");
const HARNESS = path.join(__dirname, "e2e/harness.cjs");
const FAKE_PROVIDER = path.join(__dirname, "e2e/fake-provider.cjs");

let root: string;
let app: string;
let callsLog: string;

const baseAnswers = {
  locales: ["es", "fr-FR"],
  textComponents: "ThemedText, AppText",
  provider: "custom",
  customProviderPath: ` ${FAKE_PROVIDER} `,
  retranslate: true,
  saveCiConfig: false,
};

function runCli(
  flags: string[] = ["--deep"],
  answers: Partial<typeof baseAnswers> = {},
): string {
  fs.writeFileSync(callsLog, "");
  const result = spawnSync(process.execPath, [HARNESS, ...flags], {
    cwd: root,
    encoding: "utf-8",
    timeout: 60_000,
    env: {
      ...process.env,
      HOME: root, // keep run logs and credentials out of the real home dir
      CALLS_LOG: callsLog,
      ANSWERS: JSON.stringify({ projectPath: app, ...baseAnswers, ...answers }),
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0) {
    throw new Error(`CLI exited with ${result.status}:\n${output}`);
  }
  return output;
}

/** Runs `--check`; no answers are scripted, so any prompt fails the run. */
function runCheck(extraFlags: string[] = []): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [HARNESS, "--check", "--project", app, ...extraFlags],
    {
      cwd: root,
      encoding: "utf-8",
      timeout: 60_000,
      env: { ...process.env, HOME: root, ANSWERS: "{}" },
    },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function providerCalls(): Array<{ targetLocale: string; keys: string[] }> {
  return fs
    .readFileSync(callsLog, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readJson(rel: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(app, rel), "utf-8"));
}

function readApp(rel: string): string {
  return fs.readFileSync(path.join(app, rel), "utf-8");
}

function readFixture(rel: string): string {
  return fs.readFileSync(path.join(FIXTURE, rel), "utf-8");
}

function sourceFiles(dir: string = app): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === "locales"
        ? []
        : sourceFiles(full);
    }
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
  });
}

function copyFixture(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "locales") continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyFixture(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Every t("key") call, plus whether `t` is actually in scope there. */
function analyzeTranslationCalls(source: string) {
  const ast = babelParser.parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
  const keys: string[] = [];
  const unboundCalls: string[] = [];
  const misplacedHooks: string[] = [];

  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      if (callee.type !== "Identifier") return;

      if (callee.name === "t") {
        const arg = p.node.arguments[0];
        const key = arg?.type === "StringLiteral" ? arg.value : "<dynamic>";
        keys.push(key);
        if (!p.scope.hasBinding("t")) unboundCalls.push(key);
      }

      if (callee.name === "useTranslation") {
        const fn = p.getFunctionParent();
        const decl = fn?.parentPath;
        const name =
          fn?.node.type === "FunctionDeclaration"
            ? fn.node.id?.name
            : decl?.node.type === "VariableDeclarator" &&
                decl.node.id.type === "Identifier"
              ? decl.node.id.name
              : undefined;
        if (!name || !/^([A-Z]|use[A-Z])/.test(name)) {
          misplacedHooks.push(name ?? "<anonymous>");
        }
      }
    },
  });

  return { keys, unboundCalls, misplacedHooks };
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-autopilot-e2e-"));
  app = path.join(root, "app");
  callsLog = path.join(root, "calls.log");
  copyFixture(FIXTURE, app);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("end-to-end on the scenario fixture", { timeout: 90_000 }, () => {
  let firstRun: string;

  it("first run extracts, translates and rewrites", () => {
    firstRun = runCli();
    expect(firstRun).toContain("14 new, 0 modified, 0 unchanged");
    expect(firstRun).toContain("✨ Done!");
  });

  it("validates the custom provider path at the prompt", () => {
    expect(firstRun).toContain(
      "validate empty -> Enter the path to a JS file that exports your provider.",
    );
    expect(firstRun).toContain("validate missing -> No file found at");
  });

  it("extracts the expected English", () => {
    const en = readJson("locales/en.json");
    expect(en).toMatchObject({
      // BasicText
      welcome_demo: "Welcome to the demo",
      tap_card_learn: "Tap a card to learn more",
      swipe_left_dismiss: "Swipe left to dismiss",
      sentence_split_across: "This sentence is split across two lines",
      terms_apply: "Terms apply.",
      read_full_policy: "Read the full policy",
      // CustomText (ThemedText, AppText entered as custom components)
      your_profile_complete: "Your profile is complete",
      notifications_are_turned: "Notifications are turned on",
      // KeyCollisions
      get_started_your: "Get started with your app",
      get_started_your_2: "Get started with your account",
      save: "Save",
      // ComponentShapes
      nothing_here_yet: "Nothing here yet",
      could_not_load: "Could not load your data",
      good_morning: "Good morning",
      // AlreadyTranslated
      newly_added_subtitle: "Newly added subtitle",
      // hooks/useGreeting
      welcome_back: "Welcome back",
      // --deep patterns
      home: "Home",
      react_native: "React Native",
      operation_completed_successfully: "Operation completed successfully",
      something_went_wrong: "Something went wrong, please try again",
    });
  });

  it("leaves non-UI values and unsupported code out of en.json", () => {
    const values = Object.values(readJson("locales/en.json"));
    for (const excluded of [
      "Legacy banner text", // class component
      "Unlisted wrapper text", // Label wasn't entered as a Text component
      "idle", // useState state value
      "Skipped constants text", // constants/ is skipped
      "Skipped test file text", // *.test.tsx is skipped
      "42",
      "—",
      "x",
      "Search products", // TextInput placeholder (not supported yet)
      "Screen container", // accessibilityLabel (not supported yet)
      "not-translated-screen", // testID
    ]) {
      expect(values).not.toContain(excluded);
    }
    expect(Object.keys(readJson("locales/en.json"))).not.toContain(
      "read_full_policy_2",
    );
    expect(Object.keys(readJson("locales/en.json"))).not.toContain("save_2");
  });

  it("translates every key into every locale", () => {
    const en = readJson("locales/en.json");
    for (const locale of ["es", "fr-FR"]) {
      const translated = readJson(`locales/${locale}.json`);
      expect(Object.keys(translated).sort()).toEqual(Object.keys(en).sort());
      expect(translated.welcome_demo).toBe(`[${locale}] Welcome to the demo`);
    }
  });

  it("records translation sources in the committable file", () => {
    const sources = readJson("i18n-autopilot.sources.json");
    const en = readJson("locales/en.json");
    expect(Object.keys(sources)).toEqual(["es", "fr-FR"]);
    expect(sources.es).toEqual(en);
  });

  it("produces rewritten code where every t() is in scope and no key is orphaned", () => {
    const en = readJson("locales/en.json");
    const referenced = new Set<string>();

    for (const file of sourceFiles()) {
      const rel = path.relative(app, file);
      const { keys, unboundCalls, misplacedHooks } = analyzeTranslationCalls(
        fs.readFileSync(file, "utf-8"),
      );
      expect(unboundCalls, `t() without useTranslation in ${rel}`).toEqual([]);
      expect(misplacedHooks, `useTranslation outside a component in ${rel}`).toEqual([]);
      keys.forEach((k) => referenced.add(k));
    }

    const preExisting = new Set(["existing_title"]);
    for (const key of referenced) {
      if (!preExisting.has(key)) expect(en, `t("${key}") has no entry`).toHaveProperty(key);
    }
    for (const key of Object.keys(en)) {
      expect(referenced.has(key), `en.json key "${key}" is never used`).toBe(true);
    }
  });

  it("rewrites each component shape correctly", () => {
    const shapes = readApp("screens/ComponentShapes.tsx");
    expect(shapes).toMatch(/export const EmptyState = \(\) => \{\s*const \{\s*t\s*\} = useTranslation\(\);\s*return <Text>\{t\("nothing_here_yet"\)\}<\/Text>;/);

    const basic = readApp("screens/BasicText.tsx");
    expect(basic).toContain('{t("terms_apply")} <Text>{t("read_full_policy")}</Text>');

    const already = readApp("screens/AlreadyTranslated.tsx");
    expect(already.match(/useTranslation\(\)/g)).toHaveLength(1);
    expect(already.match(/import \{ useTranslation \}/g)).toHaveLength(1);

    const hook = readApp("hooks/useGreeting.ts");
    expect(hook).toContain('useState(t("welcome_back"))');
    expect(hook).toContain('useState("idle")');

    const custom = readApp("screens/CustomText.tsx");
    expect(custom).toContain("<Label>Unlisted wrapper text</Label>");

    const collisions = readApp("screens/KeyCollisions.tsx");
    expect(collisions).toMatch(
      /import \{ useTranslation \} from "react-i18next";\n\/\/ Scenario: strings whose generated keys collide/,
    );
  });

  it("leaves files with nothing to translate byte-for-byte unchanged", () => {
    for (const rel of [
      "screens/ClassComponent.tsx",
      "screens/NotTranslated.tsx",
      "screens/BasicText.test.tsx",
      "constants/copy.tsx",
      "components/Typography.tsx",
      "App.tsx",
    ]) {
      expect(readApp(rel), rel).toBe(readFixture(rel));
    }
  });

  it("second run with no changes skips everything", () => {
    const output = runCli();
    expect(output).toContain("0 new, 0 modified, 14 unchanged");
    expect(output).toContain("es — up to date, skipping");
    expect(output).toContain("fr-FR — up to date, skipping");
    expect(providerCalls()).toEqual([]);
  });

  it("--check passes on a fully translated project without prompting", () => {
    const { status, stdout, stderr } = runCheck();
    expect(stderr).not.toContain("No scripted answer");
    expect(status).toBe(0);
    expect(stdout).toMatch(/es\s+\d+\/\d+\s+✅\s+100%/);
    expect(stdout).toMatch(/fr-FR\s+\d+\/\d+\s+✅\s+100%/);
    expect(stdout).toContain("All locales are up to date.");
  });

  it("dry run writes nothing", () => {
    const before = fs.readFileSync(path.join(app, "locales/en.json"), "utf-8");
    fs.appendFileSync(
      path.join(app, "screens/BasicText.tsx"),
      "\nexport const Extra = () => <Text>Dry run only</Text>;\n",
    );
    const output = runCli(["--deep", "--dry-run"]);
    expect(output).toContain("Dry-run mode");
    expect(fs.readFileSync(path.join(app, "locales/en.json"), "utf-8")).toBe(before);
    expect(readApp("screens/BasicText.tsx")).toContain("<Text>Dry run only</Text>");
    expect(providerCalls()).toEqual([]);
  });

  it("picks up a modified file on the next real run", () => {
    const output = runCli();
    expect(output).toContain("0 new, 1 modified");
    expect(readJson("locales/en.json").dry_run_only).toBe("Dry run only");
    expect(providerCalls().map((c) => c.keys)).toEqual([["dry_run_only"], ["dry_run_only"]]);
  });

  it("changed English: answering No keeps translations and asks again", () => {
    const en = readJson("locales/en.json");
    en.welcome_demo = "Welcome to the live demo";
    fs.writeFileSync(path.join(app, "locales/en.json"), JSON.stringify(en, null, 2));

    const output = runCli(["--deep"], { retranslate: false });
    expect(output).toContain("[harness] asked retranslate");
    expect(output).toContain("es — 1 changed key(s) kept as-is, skipping");
    expect(providerCalls()).toEqual([]);
    expect(readJson("locales/es.json").welcome_demo).toBe("[es] Welcome to the demo");
  });

  it("--check flags the kept translation as outdated and exits 1", () => {
    const { status, stdout } = runCheck();
    expect(status).toBe(1);
    expect(stdout).toContain("1 outdated");
    expect(stdout).toContain(
      "Outdated in es (English changed since translation):\n    - welcome_demo",
    );
  });

  it("changed English: answering Yes re-translates only the changed key", () => {
    const output = runCli(["--deep"], { retranslate: true });
    expect(output).toContain("[harness] asked retranslate");
    expect(providerCalls().map((c) => c.keys)).toEqual([["welcome_demo"], ["welcome_demo"]]);
    expect(readJson("locales/es.json").welcome_demo).toBe("[es] Welcome to the live demo");
    expect(readJson("i18n-autopilot.sources.json").es.welcome_demo).toBe(
      "Welcome to the live demo",
    );

    const again = runCli();
    expect(again).not.toContain("[harness] asked retranslate");
  });

  it("a later string with a colliding key gets a new suffix and keeps existing English", () => {
    fs.writeFileSync(
      path.join(app, "screens/Onboarding.tsx"),
      [
        'import React from "react";',
        'import { Text } from "react-native";',
        "",
        "export default function Onboarding() {",
        "  return <Text>Get started with your adventure</Text>;",
        "}",
        "",
      ].join("\n"),
    );
    runCli();
    const en = readJson("locales/en.json");
    expect(en.get_started_your).toBe("Get started with your app");
    expect(en.get_started_your_2).toBe("Get started with your account");
    expect(en.get_started_your_3).toBe("Get started with your adventure");
    expect(readApp("screens/Onboarding.tsx")).toContain('t("get_started_your_3")');
  });

  it("--check --json reports missing and stale keys for dashboards", () => {
    const frPath = path.join(app, "locales/fr-FR.json");
    const fr = readJson("locales/fr-FR.json");
    delete fr.good_morning;
    fr.removed_feature = "[fr-FR] Removed feature";
    fs.writeFileSync(frPath, JSON.stringify(fr, null, 2));

    const { status, stdout } = runCheck(["--json"]);
    expect(status).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
    const frReport = report.locales.find((l: any) => l.locale === "fr-FR");
    expect(frReport.missing).toEqual(["good_morning"]);
    expect(frReport.stale).toEqual(["removed_feature"]);
    const esReport = report.locales.find((l: any) => l.locale === "es");
    expect(esReport).toMatchObject({ missing: [], stale: [], outdated: [] });
  });

  it("--check --locales limits the report to the named locales", () => {
    const { status, stdout } = runCheck(["--locales", "es"]);
    expect(status).toBe(0);
    expect(stdout).not.toContain("fr-FR");
  });

  it("--check exits 2 when the project has no en.json", () => {
    const empty = fs.mkdtempSync(path.join(root, "empty-"));
    const result = spawnSync(process.execPath, [HARNESS, "--check", "--project", empty], {
      encoding: "utf-8",
      env: { ...process.env, HOME: root, ANSWERS: "{}" },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("No locales/en.json");
  });
});
