/**
 * End-to-end for `--ci`: runs the real CLI against copies of the scenario
 * fixture with NO scripted answers, so any prompt fails the run.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const FIXTURE = path.join(__dirname, "fixtures/deep-analyzer-sample");
const HARNESS = path.join(__dirname, "e2e/harness.cjs");

let root: string;
let callsLog: string;

function copyFixture(dest: string) {
  fs.cpSync(FIXTURE, dest, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|locales)([\\/]|$)/.test(path.sep + path.relative(FIXTURE, src)),
  });
}

function freshApp(name: string, config?: Record<string, unknown>): string {
  const app = path.join(root, name);
  copyFixture(app);
  if (config) {
    fs.writeFileSync(path.join(app, "i18n-autopilot.config.json"), JSON.stringify(config, null, 2));
  }
  return app;
}

function run(
  flags: string[],
  { answers = {}, env = {} }: { answers?: Record<string, unknown>; env?: Record<string, string> } = {},
) {
  fs.writeFileSync(callsLog, "");
  const result = spawnSync(process.execPath, [HARNESS, ...flags], {
    cwd: root,
    encoding: "utf-8",
    timeout: 60_000,
    env: {
      ...process.env,
      HOME: root,
      CALLS_LOG: callsLog,
      ANSWERS: JSON.stringify(answers),
      ...env,
    },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

function providerCalls(): Array<{ targetLocale: string; keys: string[] }> {
  return fs
    .readFileSync(callsLog, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readJson(file: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

const CI_CONFIG = {
  targetLocales: ["es", "fr-FR"],
  provider: "custom",
  customProviderPath: "../fake-provider.cjs",
  textComponents: ["ThemedText", "AppText"],
  deep: true,
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-autopilot-e2e-ci-"));
  callsLog = path.join(root, "calls.log");
  fs.copyFileSync(path.join(__dirname, "e2e/fake-provider.cjs"), path.join(root, "fake-provider.cjs"));
  fs.writeFileSync(
    path.join(root, "failing-provider.cjs"),
    `module.exports = {
      name: "flaky",
      async translate(data, _src, target) {
        if (target === "fr-FR") throw new Error("quota exceeded");
        return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, "[" + target + "] " + v]));
      },
    };\n`,
  );
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("--ci end to end", { timeout: 90_000 }, () => {
  let app: string;

  it("runs the whole pipeline without prompting", () => {
    app = freshApp("app", CI_CONFIG);
    const { status, output } = run(["--ci", "--project", app]);

    expect(output).not.toContain("No scripted answer");
    expect(status).toBe(0);
    expect(output).toContain("i18n Autopilot (CI mode)");
    expect(output).toContain("✨ Done!");
    // Plain lines, no cursor-hiding spinner control codes.
    expect(output).not.toContain("\u001b[?25l");

    const en = readJson(path.join(app, "locales/en.json"));
    expect(en.welcome_demo).toBe("Welcome to the demo");
    expect(en.your_profile_complete).toBe("Your profile is complete"); // ThemedText
    expect(en.home).toBe("Home"); // --deep pattern, from "deep": true
    expect(readJson(path.join(app, "locales/fr-FR.json")).welcome_demo).toBe(
      "[fr-FR] Welcome to the demo",
    );
    expect(fs.readFileSync(path.join(app, "screens/BasicText.tsx"), "utf-8")).toContain(
      't("welcome_demo")',
    );
    expect(providerCalls().map((c) => c.targetLocale)).toEqual(["es", "fr-FR"]);
  });

  it("a second run with no changes does nothing", () => {
    const { status, output } = run(["--ci", "--project", app]);
    expect(status).toBe(0);
    expect(output).toContain("es — up to date, skipping");
    expect(providerCalls()).toEqual([]);
  });

  it("re-translates changed English without asking (retranslateChanged defaults to true)", () => {
    const enPath = path.join(app, "locales/en.json");
    const en = readJson(enPath);
    en.welcome_demo = "Welcome to the live demo";
    fs.writeFileSync(enPath, JSON.stringify(en, null, 2));

    const { status, output } = run(["--ci", "--project", app]);
    expect(status).toBe(0);
    expect(output).toContain("1 English string(s) changed since they were last translated — re-translating them");
    expect(providerCalls().map((c) => c.keys)).toEqual([["welcome_demo"], ["welcome_demo"]]);
    expect(readJson(path.join(app, "locales/es.json")).welcome_demo).toBe("[es] Welcome to the live demo");
  });

  it("keeps changed translations when retranslateChanged is false", () => {
    const keepApp = freshApp("keep-app", { ...CI_CONFIG, retranslateChanged: false });
    expect(run(["--ci", "--project", keepApp]).status).toBe(0);

    const enPath = path.join(keepApp, "locales/en.json");
    const en = readJson(enPath);
    en.good_morning = "Good evening";
    fs.writeFileSync(enPath, JSON.stringify(en, null, 2));

    const { status, output } = run(["--ci", "--project", keepApp]);
    expect(status).toBe(0);
    expect(output).toContain('keeping existing translations ("retranslateChanged": false)');
    expect(providerCalls()).toEqual([]);
    expect(readJson(path.join(keepApp, "locales/es.json")).good_morning).toBe("[es] Good morning");
  });

  it("exits 1 when a locale fails, after translating the others", () => {
    const flaky = freshApp("flaky-app", { ...CI_CONFIG, customProviderPath: "../failing-provider.cjs" });
    const { status, output } = run(["--ci", "--project", flaky]);
    expect(status).toBe(1);
    expect(output).toContain("✘ fr-FR (flaky) — quota exceeded");
    expect(output).toContain("1 locale(s) failed to translate.");
    expect(fs.existsSync(path.join(flaky, "locales/es.json"))).toBe(true);
    expect(fs.existsSync(path.join(flaky, "locales/fr-FR.json"))).toBe(false);
  });

  it("exits 2 with a clear message when the config is missing or invalid", () => {
    const noConfig = freshApp("no-config");
    let result = run(["--ci", "--project", noConfig]);
    expect(result.status).toBe(2);
    expect(result.output).toContain("No config file at");

    fs.writeFileSync(
      path.join(noConfig, "i18n-autopilot.config.json"),
      JSON.stringify({ targetLocales: "es", provider: "openai" }),
    );
    result = run(["--ci", "--project", noConfig]);
    expect(result.status).toBe(2);
    expect(result.output).toContain('"targetLocales" must be a non-empty array');
  });

  it("exits 2 naming the environment variable when a provider key is missing", () => {
    const keyless = freshApp("keyless", { targetLocales: ["es"], provider: "openai" });
    const { status, output } = run(["--ci", "--project", keyless], { env: { OPENAI_API_KEY: "" } });
    expect(status).toBe(2);
    expect(output).toContain('The "openai" provider needs OPENAI_API_KEY set in the environment');
  });

  it("doesn't install dependencies unless installDependencies is true", () => {
    const noDeps = freshApp("no-deps", CI_CONFIG);
    fs.writeFileSync(path.join(noDeps, "package.json"), JSON.stringify({ name: "no-deps", dependencies: {} }));
    const { status, output } = run(["--ci", "--project", noDeps]);
    expect(status).toBe(1);
    expect(output).toContain('set "installDependencies": true in i18n-autopilot.config.json');
    expect(JSON.parse(fs.readFileSync(path.join(noDeps, "package.json"), "utf-8")).dependencies).toEqual({});
  });

  it("reads a config from elsewhere with --config", () => {
    const elsewhere = freshApp("elsewhere");
    const configFile = path.join(root, "shared-ci.json");
    fs.writeFileSync(configFile, JSON.stringify({ ...CI_CONFIG, customProviderPath: "./fake-provider.cjs" }));
    const { status } = run(["--ci", "--project", elsewhere, "--config", configFile]);
    expect(status).toBe(0);
    expect(fs.existsSync(path.join(elsewhere, "locales/es.json"))).toBe(true);
  });

  it("an interactive run can save its settings, which --ci then uses", () => {
    const interactiveApp = freshApp("interactive-app");
    const { status } = run(["--deep"], {
      answers: {
        projectPath: interactiveApp,
        locales: ["es"],
        textComponents: "ThemedText, AppText",
        provider: "custom",
        customProviderPath: path.join(root, "fake-provider.cjs"),
        retranslate: true,
        saveCiConfig: true,
      },
    });
    expect(status).toBe(0);

    const saved = readJson(path.join(interactiveApp, "i18n-autopilot.config.json"));
    expect(saved).toEqual({
      targetLocales: ["es"],
      provider: "custom",
      customProviderPath: "../fake-provider.cjs",
      textComponents: ["ThemedText", "AppText"],
      deep: true,
      retranslateChanged: true,
      installDependencies: false,
    });

    const ci = run(["--ci", "--project", interactiveApp]);
    expect(ci.status).toBe(0);
    expect(ci.output).toContain("es — up to date, skipping");
  });

  it("rejects flag combinations that don't make sense", () => {
    expect(run(["--config", "x.json"]).output).toContain("--config can only be used with --ci");
    expect(run(["--ci", "--check"]).output).toContain("--check and --ci can't be used together");
    expect(run(["--project", "x"]).output).toContain("--project can only be used with --check or --ci");
  });
});
