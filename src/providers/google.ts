/**
 * src/providers/google.ts — Google Cloud Translation adapter.
 * Uses the Cloud Translation v2 REST API via native fetch (Node ≥ 18).
 */

import { TranslationProvider, ProviderError } from "./types";

export class GoogleProvider implements TranslationProvider {
  readonly name = "google";

  constructor(private readonly apiKey: string) {}

  async translate(
    data: Record<string, string>,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    if (Object.keys(data).length === 0) return {};

    const keys = Object.keys(data);
    const values = keys.map((k) => data[k]);

    const body = JSON.stringify({
      q: values,
      target: targetLocale,
      source: sourceLocale,
      format: "text",
    });

    let response: Response;
    try {
      response = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body,
        },
      );
    } catch (err: unknown) {
      throw new ProviderError(
        "google",
        err instanceof Error ? err.message : String(err),
      );
    }

    if (!response.ok) {
      const bodyExcerpt = (await response.text()).slice(0, 200);
      throw new ProviderError(
        "google",
        `HTTP ${response.status}: ${bodyExcerpt}`,
      );
    }

    const json = (await response.json()) as {
      data: { translations: Array<{ translatedText: string }> };
    };

    const result: Record<string, string> = {};
    for (let i = 0; i < keys.length; i++) {
      result[keys[i]] = json.data.translations[i].translatedText;
    }
    return result;
  }
}
