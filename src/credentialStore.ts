/**
 * src/credentialStore.ts — Per-provider credential storage.
 *
 * Reads and writes ~/.i18n-autopilot/config.json with 0o600 permissions.
 * Handles legacy migration from the flat { apiKey } format to the nested
 * { providers: { lingo: { apiKey } } } format transparently.
 */

import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".i18n-autopilot");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

interface ProviderCredentials {
  [providerName: string]: Record<string, string> | undefined;
}

interface Config {
  providers?: ProviderCredentials;
  apiKey?: string; // legacy field — migrated on first read
}

/**
 * Reads the config file and returns the parsed object.
 * Returns {} if the file doesn't exist or contains malformed JSON.
 */
function readConfig(): Config {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    return {};
  }
}

/**
 * Writes the config object back to disk with 0o600 permissions.
 * Ensures the config directory exists before writing.
 */
function writeConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/**
 * Loads the stored credentials for a given provider.
 *
 * @param providerName  The provider's registry key, e.g. "lingo", "deepl".
 * @returns             The credential map, or null if not found.
 */
export function loadCredential(
  providerName: string,
): Record<string, string> | null {
  const config = readConfig();
  return config.providers?.[providerName] ?? null;
}

/**
 * Saves credentials for a given provider, preserving all other providers'
 * credentials.
 *
 * @param providerName  The provider's registry key.
 * @param creds         The credential map to store.
 */
export function saveCredential(
  providerName: string,
  creds: Record<string, string>,
): void {
  const config = readConfig();
  if (!config.providers) {
    config.providers = {};
  }
  config.providers[providerName] = creds;
  writeConfig(config);
}

/**
 * Migrates the legacy flat { apiKey } format to the nested
 * { providers: { lingo: { apiKey } } } format.
 *
 * - No-ops if the file doesn't exist or is already migrated.
 * - Silent — no console output, no user prompts.
 */
export function migrateIfNeeded(): void {
  const config = readConfig();

  if (config.apiKey === undefined || config.apiKey === null) {
    return;
  }

  // Only migrate if lingo credentials are not already present.
  if (config.providers?.["lingo"] !== undefined) {
    return;
  }

  const legacyApiKey = config.apiKey;

  if (!config.providers) {
    config.providers = {};
  }
  config.providers["lingo"] = { apiKey: legacyApiKey };
  delete config.apiKey;

  writeConfig(config);
}
