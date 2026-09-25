/**
 * src/providers/openai.ts — OpenAI translation adapter.
 * Translates in batches via the Chat Completions API (gpt-4o), using strict
 * structured outputs so each response is valid JSON containing exactly the
 * requested keys.
 */

import { TranslationProvider, ProviderError } from "./types";

const MODEL = "gpt-4o";
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

interface ChatCompletion {
  choices: Array<{
    finish_reason?: string;
    message: { content: string | null; refusal?: string | null };
  }>;
}

export class OpenAIProvider implements TranslationProvider {
  readonly name = "openai";

  constructor(private readonly apiKey: string) {}

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

    const systemMessage =
      `You are a professional translator. The user sends user-facing strings from a mobile app UI as a JSON object. ` +
      `Translate each value from ${sourceLocale} to ${targetLocale}. Keep the same keys, preserve placeholders like {{name}} ` +
      `and any leading/trailing whitespace, and match the tone of an app interface.`;

    const body = JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: JSON.stringify(batch) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "translations",
          strict: true,
          schema: schemaForKeys(keys),
        },
      },
    });

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });
    } catch (err: unknown) {
      throw new ProviderError(
        "openai",
        err instanceof Error ? err.message : String(err),
      );
    }

    if (!response.ok) {
      const bodyExcerpt = (await response.text()).slice(0, 200);
      throw new ProviderError(
        "openai",
        `HTTP ${response.status}: ${bodyExcerpt}`,
      );
    }

    const json = (await response.json()) as ChatCompletion;
    const choice = json.choices[0];

    if (choice?.message?.refusal) {
      throw new ProviderError(
        "openai",
        `Model declined to translate this batch: ${choice.message.refusal}`,
      );
    }
    if (choice?.finish_reason === "length") {
      throw new ProviderError(
        "openai",
        `Response was truncated at ${MAX_TOKENS} tokens for a batch of ${keys.length} strings`,
      );
    }

    const rawContent = choice?.message?.content ?? "";

    let translated: Record<string, string>;
    try {
      translated = JSON.parse(rawContent);
    } catch {
      throw new ProviderError(
        "openai",
        `Failed to parse model response as JSON: ${rawContent.slice(0, 200)}`,
      );
    }

    const missingKeys = keys.filter((k) => typeof translated[k] !== "string");
    const extraKeys = Object.keys(translated).filter((k) => !(k in batch));
    if (missingKeys.length > 0 || extraKeys.length > 0) {
      throw new ProviderError(
        "openai",
        `Response key mismatch — missing: [${missingKeys.join(", ")}], extra: [${extraKeys.join(", ")}]`,
      );
    }

    return translated;
  }
}
