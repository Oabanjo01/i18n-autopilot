/**
 * src/providers/openai.ts — OpenAI translation adapter.
 * Uses the Chat Completions API (gpt-4o) via native fetch (Node ≥ 18).
 * Sends the full key→value map as a JSON object and asks the model to
 * return a JSON object with the same keys and translated values.
 */

import { TranslationProvider, ProviderError } from "./types";

export class OpenAIProvider implements TranslationProvider {
  readonly name = "openai";

  constructor(private readonly apiKey: string) {}

  async translate(
    data: Record<string, string>,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    if (Object.keys(data).length === 0) return {};

    const systemMessage =
      `You are a professional translator. Translate the JSON object values from ` +
      `${sourceLocale} to ${targetLocale}. Return ONLY a valid JSON object with the ` +
      `same keys and translated values. Do not add any explanation.`;

    const body = JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: JSON.stringify(data) },
      ],
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

    const json = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const rawContent = json.choices[0]?.message?.content ?? "";

    let translated: Record<string, string>;
    try {
      translated = JSON.parse(rawContent);
    } catch {
      throw new ProviderError(
        "openai",
        `Failed to parse model response as JSON: ${rawContent.slice(0, 200)}`,
      );
    }

    // Validate that the returned keys match the input keys exactly
    const inputKeys = Object.keys(data);
    const outputKeys = Object.keys(translated);
    const missingKeys = inputKeys.filter((k) => !(k in translated));
    const extraKeys = outputKeys.filter((k) => !(k in data));

    if (missingKeys.length > 0 || extraKeys.length > 0) {
      throw new ProviderError(
        "openai",
        `Response key mismatch — missing: [${missingKeys.join(", ")}], extra: [${extraKeys.join(", ")}]`,
      );
    }

    return translated;
  }
}
