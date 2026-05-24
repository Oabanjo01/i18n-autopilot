/**
 * src/providers/claude.ts — Anthropic Claude translation adapter.
 * Uses the Messages API (claude-opus-4-5) via native fetch (Node ≥ 18).
 * Sends the full key→value map as a JSON object and asks the model to
 * return a JSON object with the same keys and translated values.
 */

import { TranslationProvider, ProviderError } from "./types";

export class ClaudeProvider implements TranslationProvider {
  readonly name = "claude";

  constructor(private readonly apiKey: string) {}

  async translate(
    data: Record<string, string>,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    if (Object.keys(data).length === 0) return {};

    const prompt =
      `Translate the following JSON object values from ${sourceLocale} to ${targetLocale}.\n` +
      `Return ONLY a valid JSON object with the same keys and translated values.\n` +
      `Do not add any explanation, markdown, or code fences.\n\n` +
      JSON.stringify(data, null, 2);

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (err: unknown) {
      throw new ProviderError(
        "claude",
        err instanceof Error ? err.message : String(err),
      );
    }

    if (!response.ok) {
      const bodyExcerpt = (await response.text()).slice(0, 200);
      throw new ProviderError(
        "claude",
        `HTTP ${response.status}: ${bodyExcerpt}`,
      );
    }

    const json = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const rawContent = json.content.find((c) => c.type === "text")?.text ?? "";

    let translated: Record<string, string>;
    try {
      translated = JSON.parse(rawContent);
    } catch {
      throw new ProviderError(
        "claude",
        `Failed to parse model response as JSON: ${rawContent.slice(0, 200)}`,
      );
    }

    // Validate that the returned keys match the input keys
    const inputKeys = Object.keys(data);
    const missingKeys = inputKeys.filter((k) => !(k in translated));
    if (missingKeys.length > 0) {
      throw new ProviderError(
        "claude",
        `Response missing keys: [${missingKeys.join(", ")}]`,
      );
    }

    return translated;
  }
}
