/**
 * src/providers/claude.ts — Anthropic Claude translation adapter.
 * Translates in batches via the Messages API, using structured outputs so each
 * response is valid JSON containing exactly the requested keys.
 */

import Anthropic from "@anthropic-ai/sdk";
import { TranslationProvider, ProviderError } from "./types";

const MODEL = "claude-opus-5";
const BATCH_SIZE = 50;
const MAX_TOKENS = 16000;

function chunkEntries(
  data: Record<string, string>,
  size: number,
): Record<string, string>[] {
  const entries = Object.entries(data);
  const chunks: Record<string, string>[] = [];
  for (let i = 0; i < entries.length; i += size) {
    chunks.push(Object.fromEntries(entries.slice(i, i + size)));
  }
  return chunks;
}

function schemaForKeys(keys: string[]) {
  return {
    type: "object",
    properties: Object.fromEntries(keys.map((k) => [k, { type: "string" }])),
    required: keys,
    additionalProperties: false,
  };
}

export class ClaudeProvider implements TranslationProvider {
  readonly name = "claude";
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async translate(
    data: Record<string, string>,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    if (Object.keys(data).length === 0) return {};

    const result: Record<string, string> = {};
    for (const batch of chunkEntries(data, BATCH_SIZE)) {
      Object.assign(
        result,
        await this.translateBatch(batch, sourceLocale, targetLocale),
      );
    }
    return result;
  }

  private async translateBatch(
    batch: Record<string, string>,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    const keys = Object.keys(batch);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: schemaForKeys(keys) },
        },
        messages: [
          {
            role: "user",
            content:
              `These are user-facing strings from a mobile app UI. Translate each value from ${sourceLocale} to ${targetLocale}. ` +
              `Keep the same keys, preserve placeholders like {{name}} and any leading/trailing whitespace, and match the tone of an app interface.\n\n` +
              JSON.stringify(batch, null, 2),
          },
        ],
      });
    } catch (err: unknown) {
      if (err instanceof Anthropic.APIError) {
        throw new ProviderError(
          "claude",
          `HTTP ${err.status ?? "error"}: ${err.message}`,
        );
      }
      throw new ProviderError(
        "claude",
        err instanceof Error ? err.message : String(err),
      );
    }

    if (response.stop_reason === "refusal") {
      throw new ProviderError("claude", "Model declined to translate this batch");
    }
    if (response.stop_reason === "max_tokens") {
      throw new ProviderError(
        "claude",
        `Response was truncated at ${MAX_TOKENS} tokens for a batch of ${keys.length} strings`,
      );
    }

    const rawContent =
      response.content.find(
        (b): b is Anthropic.Beta.BetaTextBlock => b.type === "text",
      )?.text ?? "";

    let translated: Record<string, string>;
    try {
      translated = JSON.parse(rawContent);
    } catch {
      throw new ProviderError(
        "claude",
        `Failed to parse model response as JSON: ${rawContent.slice(0, 200)}`,
      );
    }

    const missingKeys = keys.filter((k) => typeof translated[k] !== "string");
    if (missingKeys.length > 0) {
      throw new ProviderError(
        "claude",
        `Response missing keys: [${missingKeys.join(", ")}]`,
      );
    }

    return Object.fromEntries(keys.map((k) => [k, translated[k]]));
  }
}
