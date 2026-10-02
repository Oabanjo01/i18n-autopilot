import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  CONFIG_FILE_NAME,
  ConfigError,
  RunSettings,
  ciRunSettings,
  configFromSettings,
  credentialsFromEnv,
  loadConfigFile,
  resolveConfigPath,
} from "../src/ciConfig";

let dir: string;

function writeConfig(config: unknown, name = CONFIG_FILE_NAME): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof config === "string" ? config : JSON.stringify(config));
  return file;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-config-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("loadConfigFile", () => {
  it("accepts a minimal valid config", () => {
    const file = writeConfig({ targetLocales: ["es"], provider: "openai" });
    expect(loadConfigFile(file)).toEqual({ targetLocales: ["es"], provider: "openai" });
  });

  it("explains how to create the file when it's missing", () => {
    expect(() => loadConfigFile(path.join(dir, CONFIG_FILE_NAME))).toThrow(
      /No config file at .*i18n-autopilot\.config\.json/,
    );
  });

  it("reports unparseable JSON", () => {
    const file = writeConfig("{ nope");
    expect(() => loadConfigFile(file)).toThrow(ConfigError);
    expect(() => loadConfigFile(file)).toThrow(/Could not parse/);
  });

  it("rejects a non-object", () => {
    expect(() => loadConfigFile(writeConfig("[]"))).toThrow(/must contain a JSON object/);
  });

  it("reports every problem at once", () => {
    const file = writeConfig({
      targetLocales: [],
      provider: "deepl",
      textComponents: "ThemedText",
      deep: "yes",
      targetLocale: ["es"],
    });
    let message = "";
    try {
      loadConfigFile(file);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('unknown setting "targetLocale"');
    expect(message).toContain('"targetLocales" must be a non-empty array');
    expect(message).toContain('"provider" must be one of: lingo, google, openai');
    expect(message).toContain('"textComponents" must be an array');
    expect(message).toContain('"deep" must be true or false');
  });

  it("requires customProviderPath for the custom provider, and only then", () => {
    expect(() =>
      loadConfigFile(writeConfig({ targetLocales: ["es"], provider: "custom" })),
    ).toThrow(/"customProviderPath" is required/);
    expect(() =>
      loadConfigFile(
        writeConfig({ targetLocales: ["es"], provider: "openai", customProviderPath: "./x.js" }),
      ),
    ).toThrow(/only used when "provider" is "custom"/);
  });

  it("allows a $schema key for editor support", () => {
    const file = writeConfig({ $schema: "./schema.json", targetLocales: ["es"], provider: "mymemory" });
    expect(() => loadConfigFile(file)).not.toThrow();
  });
});

describe("credentialsFromEnv", () => {
  it("reads each provider's standard environment variable", () => {
    expect(credentialsFromEnv("openai", { OPENAI_API_KEY: "sk-1" })).toEqual({
      openai: { apiKey: "sk-1" },
    });
    expect(credentialsFromEnv("claude", { ANTHROPIC_API_KEY: "a-1" })).toEqual({
      claude: { apiKey: "a-1" },
    });
    expect(credentialsFromEnv("lingo", { LINGO_API_KEY: "l-1" })).toEqual({
      lingo: { apiKey: "l-1" },
    });
    expect(credentialsFromEnv("google", { GOOGLE_TRANSLATE_API_KEY: "g-1" })).toEqual({
      google: { apiKey: "g-1" },
    });
  });

  it("names the missing variables", () => {
    expect(() => credentialsFromEnv("openai", {})).toThrow(/needs OPENAI_API_KEY/);
    expect(() => credentialsFromEnv("aws", { AWS_ACCESS_KEY_ID: "x" })).toThrow(
      /needs AWS_SECRET_ACCESS_KEY/,
    );
    expect(() => credentialsFromEnv("claude", { ANTHROPIC_API_KEY: "   " })).toThrow(
      /needs ANTHROPIC_API_KEY/,
    );
  });

  it("applies defaults for optional settings", () => {
    expect(
      credentialsFromEnv("aws", { AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "s" }).aws?.region,
    ).toBe("us-east-1");
    expect(credentialsFromEnv("libretranslate", {})).toEqual({
      libretranslate: { url: "https://libretranslate.com", apiKey: "" },
    });
    expect(credentialsFromEnv("mymemory", {})).toEqual({ mymemory: { email: "" } });
    expect(credentialsFromEnv("custom", {})).toEqual({});
  });
});

describe("ciRunSettings", () => {
  it("combines config, flags and environment into run settings", () => {
    writeConfig({ targetLocales: ["es", "fr-FR"], provider: "openai", textComponents: ["Text", "ThemedText"] });
    const settings = ciRunSettings({
      projectPath: dir,
      deepFlag: false,
      env: { OPENAI_API_KEY: "sk-1" },
    });
    expect(settings).toEqual({
      projectPath: dir,
      locales: ["es", "fr-FR"],
      textComponents: ["Text", "ThemedText"],
      provider: "openai",
      customProviderPath: undefined,
      credentials: { openai: { apiKey: "sk-1" } },
      deep: false,
      retranslateChanged: true,
      installDependencies: false,
      interactive: false,
    });
  });

  it("turns on deep mode from either the flag or the config", () => {
    writeConfig({ targetLocales: ["es"], provider: "mymemory", deep: true });
    expect(ciRunSettings({ projectPath: dir, deepFlag: false, env: {} }).deep).toBe(true);
    writeConfig({ targetLocales: ["es"], provider: "mymemory" });
    expect(ciRunSettings({ projectPath: dir, deepFlag: true, env: {} }).deep).toBe(true);
  });

  it("resolves customProviderPath relative to the config file", () => {
    const sub = path.join(dir, "config");
    fs.mkdirSync(sub);
    const file = path.join(sub, "ci.json");
    fs.writeFileSync(
      file,
      JSON.stringify({ targetLocales: ["es"], provider: "custom", customProviderPath: "../tools/translate.js" }),
    );
    const settings = ciRunSettings({ projectPath: dir, configPath: file, deepFlag: false, env: {} });
    expect(settings.customProviderPath).toBe(path.join(dir, "tools/translate.js"));
  });

  it("uses <project>/i18n-autopilot.config.json by default", () => {
    expect(resolveConfigPath(dir)).toBe(path.join(dir, CONFIG_FILE_NAME));
    expect(resolveConfigPath(dir, "other.json")).toBe(path.resolve("other.json"));
  });
});

describe("configFromSettings", () => {
  const base: RunSettings = {
    projectPath: ".",
    locales: ["es"],
    textComponents: ["Text", "AppText"],
    provider: "claude",
    credentials: { claude: { apiKey: "secret-key" } },
    deep: true,
    retranslateChanged: "ask",
    installDependencies: "ask",
    interactive: true,
  };

  it("never includes credentials", () => {
    const config = configFromSettings(base, path.join(dir, CONFIG_FILE_NAME));
    expect(JSON.stringify(config)).not.toContain("secret-key");
    expect(config).toEqual({
      targetLocales: ["es"],
      provider: "claude",
      textComponents: ["AppText"],
      deep: true,
      retranslateChanged: true,
      installDependencies: false,
    });
  });

  it("stores the custom provider path relative to the config file", () => {
    const config = configFromSettings(
      { ...base, provider: "custom", customProviderPath: path.join(dir, "tools/t.js"), credentials: {} },
      path.join(dir, CONFIG_FILE_NAME),
    );
    expect(config.customProviderPath).toBe("./tools/t.js");
  });
});
