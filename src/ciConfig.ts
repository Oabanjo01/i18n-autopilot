/**
 * src/ciConfig.ts — Non-interactive (`--ci`) settings.
 * Reads i18n-autopilot.config.json for the answers the CLI would normally
 * prompt for, and environment variables for credentials (never the file).
 */

import fs from "fs";
import path from "path";
import { ProviderCredentials } from "./providers/registry";

export const CONFIG_FILE_NAME = "i18n-autopilot.config.json";

export const PROVIDER_NAMES = [
  "lingo",
  "google",
  "openai",
  "claude",
  "aws",
  "libretranslate",
  "mymemory",
  "custom",
] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/** Everything the pipeline needs, however it was gathered. */
export interface RunSettings {
  projectPath: string;
  locales: string[];
  /** Always includes "Text". */
  textComponents: string[];
  provider: ProviderName;
  customProviderPath?: string;
  credentials: ProviderCredentials;
  deep: boolean;
  /** "ask" prompts the user; a boolean answers without prompting. */
  retranslateChanged: boolean | "ask";
  installDependencies: boolean | "ask";
  /** False in --ci: no prompts anywhere, including inside providers. */
  interactive: boolean;
}

/** The shape of i18n-autopilot.config.json. */
export interface ConfigFile {
  $schema?: string;
  targetLocales: string[];
  provider: ProviderName;
  customProviderPath?: string;
  textComponents?: string[];
  deep?: boolean;
  retranslateChanged?: boolean;
  installDependencies?: boolean;
}

const KNOWN_KEYS = new Set([
  "$schema",
  "targetLocales",
  "provider",
  "customProviderPath",
  "textComponents",
  "deep",
  "retranslateChanged",
  "installDependencies",
]);

/** Thrown for config and environment problems; the CLI exits with code 2. */
export class ConfigError extends Error {}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function resolveConfigPath(projectPath: string, configPath?: string): string {
  return configPath
    ? path.resolve(configPath)
    : path.join(path.resolve(projectPath), CONFIG_FILE_NAME);
}

/** Reads and validates the config file, reporting every problem at once. */
export function loadConfigFile(configPath: string): ConfigFile {
  if (!fs.existsSync(configPath)) {
    throw new ConfigError(
      `No config file at ${configPath}. Create ${CONFIG_FILE_NAME} (run i18n-autopilot once interactively and choose to save your settings, or see docs/USAGE.md#ci-mode).`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (err) {
    throw new ConfigError(
      `Could not parse ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`${configPath} must contain a JSON object.`);
  }

  const config = raw as Record<string, unknown>;
  const problems: string[] = [];

  for (const key of Object.keys(config)) {
    if (!KNOWN_KEYS.has(key)) problems.push(`unknown setting "${key}"`);
  }

  if (!isStringArray(config.targetLocales) || config.targetLocales.length === 0) {
    problems.push(`"targetLocales" must be a non-empty array of locale codes, e.g. ["es", "fr-FR"]`);
  }

  if (!PROVIDER_NAMES.includes(config.provider as ProviderName)) {
    problems.push(`"provider" must be one of: ${PROVIDER_NAMES.join(", ")}`);
  }

  if (config.provider === "custom") {
    if (typeof config.customProviderPath !== "string" || !config.customProviderPath.trim()) {
      problems.push(`"customProviderPath" is required when "provider" is "custom"`);
    }
  } else if (config.customProviderPath !== undefined) {
    problems.push(`"customProviderPath" is only used when "provider" is "custom"`);
  }

  if (config.textComponents !== undefined && !isStringArray(config.textComponents)) {
    problems.push(`"textComponents" must be an array of component names`);
  }

  for (const flag of ["deep", "retranslateChanged", "installDependencies"]) {
    if (config[flag] !== undefined && typeof config[flag] !== "boolean") {
      problems.push(`"${flag}" must be true or false`);
    }
  }

  if (problems.length > 0) {
    throw new ConfigError(
      `Invalid ${path.basename(configPath)}:\n${problems.map((p) => `    - ${p}`).join("\n")}`,
    );
  }

  return config as unknown as ConfigFile;
}

type Env = Record<string, string | undefined>;

/** Environment variables each provider reads in --ci mode. */
export const PROVIDER_ENV_VARS: Record<ProviderName, { required: string[]; optional: string[] }> = {
  lingo: { required: ["LINGO_API_KEY"], optional: [] },
  google: { required: ["GOOGLE_TRANSLATE_API_KEY"], optional: [] },
  openai: { required: ["OPENAI_API_KEY"], optional: [] },
  claude: { required: ["ANTHROPIC_API_KEY"], optional: [] },
  aws: {
    required: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    optional: ["AWS_REGION"],
  },
  libretranslate: { required: [], optional: ["LIBRETRANSLATE_URL", "LIBRETRANSLATE_API_KEY"] },
  mymemory: { required: [], optional: ["MYMEMORY_EMAIL"] },
  custom: { required: [], optional: [] },
};

export function credentialsFromEnv(provider: ProviderName, env: Env): ProviderCredentials {
  const missing = PROVIDER_ENV_VARS[provider].required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new ConfigError(
      `The "${provider}" provider needs ${missing.join(" and ")} set in the environment (e.g. as a CI secret).`,
    );
  }

  switch (provider) {
    case "lingo":
      return { lingo: { apiKey: env.LINGO_API_KEY! } };
    case "google":
      return { google: { apiKey: env.GOOGLE_TRANSLATE_API_KEY! } };
    case "openai":
      return { openai: { apiKey: env.OPENAI_API_KEY! } };
    case "claude":
      return { claude: { apiKey: env.ANTHROPIC_API_KEY! } };
    case "aws":
      return {
        aws: {
          accessKeyId: env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
          region: env.AWS_REGION || "us-east-1",
        },
      };
    case "libretranslate":
      return {
        libretranslate: {
          url: env.LIBRETRANSLATE_URL || "https://libretranslate.com",
          apiKey: env.LIBRETRANSLATE_API_KEY || "",
        },
      };
    case "mymemory":
      return { mymemory: { email: env.MYMEMORY_EMAIL || "" } };
    case "custom":
      return {};
  }
}

/** Builds --ci settings from the config file and environment. */
export function ciRunSettings(options: {
  projectPath: string;
  configPath?: string;
  deepFlag: boolean;
  env: Env;
}): RunSettings {
  const configPath = resolveConfigPath(options.projectPath, options.configPath);
  const config = loadConfigFile(configPath);

  // A relative custom provider path is relative to the config file, so the
  // same config works from any working directory.
  const customProviderPath =
    config.provider === "custom" && config.customProviderPath
      ? path.resolve(path.dirname(configPath), config.customProviderPath.trim())
      : undefined;

  return {
    projectPath: options.projectPath,
    locales: config.targetLocales,
    textComponents: ["Text", ...(config.textComponents ?? []).filter((c) => c !== "Text")],
    provider: config.provider,
    customProviderPath,
    credentials: credentialsFromEnv(config.provider, options.env),
    deep: options.deepFlag || config.deep === true,
    retranslateChanged: config.retranslateChanged ?? true,
    installDependencies: config.installDependencies ?? false,
    interactive: false,
  };
}

/** The config file an interactive run would save. Never includes credentials. */
export function configFromSettings(
  settings: RunSettings,
  configPath: string,
): ConfigFile {
  const config: ConfigFile = {
    targetLocales: settings.locales,
    provider: settings.provider,
  };
  if (settings.provider === "custom" && settings.customProviderPath) {
    const relative = path.relative(path.dirname(configPath), path.resolve(settings.customProviderPath));
    config.customProviderPath = relative.startsWith(".") ? relative : `./${relative}`;
  }
  const extraComponents = settings.textComponents.filter((c) => c !== "Text");
  if (extraComponents.length > 0) config.textComponents = extraComponents;
  if (settings.deep) config.deep = true;
  config.retranslateChanged = true;
  config.installDependencies = false;
  return config;
}

export function writeConfigFile(configPath: string, config: ConfigFile): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
