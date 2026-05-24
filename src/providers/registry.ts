import * as fs from "fs";
import * as path from "path";
import { TranslationProvider } from "./types";
import { LingoProvider } from "./lingo";
import { DeepLProvider } from "./deepl";
import { GoogleProvider } from "./google";
import { OpenAIProvider } from "./openai";
import { ClaudeProvider } from "./claude";
import { AWSProvider } from "./aws";

export class ProviderRegistry {
  private providers = new Map<string, TranslationProvider>();

  register(provider: TranslationProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(
        `Provider "${provider.name}" is already registered. Names must be unique.`,
      );
    }
    this.providers.set(provider.name, provider);
  }

  get(name: string): TranslationProvider {
    const p = this.providers.get(name);
    if (!p) throw new Error(`Unknown provider: "${name}"`);
    return p;
  }

  /** Returns provider names in insertion order. */
  listNames(): string[] {
    return Array.from(this.providers.keys());
  }
}

export interface ProviderCredentials {
  lingo?: { apiKey: string };
  deepl?: { apiKey: string };
  google?: { apiKey: string };
  openai?: { apiKey: string };
  claude?: { apiKey: string };
  aws?: { accessKeyId: string; secretAccessKey: string; region: string };
}

/**
 * Builds the default registry, registering only the providers whose
 * credentials are present (non-empty strings). Providers are registered
 * in canonical order: lingo → deepl → google → openai → aws.
 */
export function buildDefaultRegistry(
  credentials: ProviderCredentials,
): ProviderRegistry {
  const registry = new ProviderRegistry();

  if (credentials.lingo?.apiKey) {
    registry.register(new LingoProvider(credentials.lingo.apiKey));
  }

  if (credentials.deepl?.apiKey) {
    registry.register(new DeepLProvider(credentials.deepl.apiKey));
  }

  if (credentials.google?.apiKey) {
    registry.register(new GoogleProvider(credentials.google.apiKey));
  }

  if (credentials.openai?.apiKey) {
    registry.register(new OpenAIProvider(credentials.openai.apiKey));
  }

  if (credentials.claude?.apiKey) {
    registry.register(new ClaudeProvider(credentials.claude.apiKey));
  }

  if (
    credentials.aws?.accessKeyId &&
    credentials.aws?.secretAccessKey &&
    credentials.aws?.region
  ) {
    registry.register(
      new AWSProvider(
        credentials.aws.accessKeyId,
        credentials.aws.secretAccessKey,
        credentials.aws.region,
      ),
    );
  }

  return registry;
}

/**
 * Resolves the active provider from the registry, optionally loading a
 * custom provider from disk first.
 */
export async function resolveProvider(
  registry: ProviderRegistry,
  selectedName: string,
  customPath?: string,
): Promise<TranslationProvider> {
  if (selectedName === "custom" && customPath) {
    const custom = await loadCustomProvider(customPath);
    registry.register(custom);
  }
  return registry.get(selectedName);
}

/**
 * Validates that an unknown object conforms to the TranslationProvider shape.
 * Throws an error listing any missing or incorrectly-typed fields.
 */
export function validateProviderShape(obj: unknown): void {
  const missing: string[] = [];
  if (typeof (obj as Record<string, unknown>)?.name !== "string") {
    missing.push("name (string)");
  }
  if (typeof (obj as Record<string, unknown>)?.translate !== "function") {
    missing.push("translate (function)");
  }
  if (missing.length > 0) {
    throw new Error(
      `Custom provider is missing required fields: ${missing.join(", ")}`,
    );
  }
}

/**
 * Loads a custom provider from a local JS/TS file.
 * Validates the exported object has `name` (string) and `translate` (function).
 */
async function loadCustomProvider(
  filePath: string,
): Promise<TranslationProvider> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Custom provider file not found: ${resolved}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(resolved);
  const exported = mod.default ?? mod;

  const missing: string[] = [];
  if (typeof exported?.name !== "string") missing.push("name (string)");
  if (typeof exported?.translate !== "function")
    missing.push("translate (function)");
  if (missing.length > 0) {
    throw new Error(
      `Custom provider at "${resolved}" is missing required fields: ${missing.join(", ")}`,
    );
  }

  return exported as TranslationProvider;
}
