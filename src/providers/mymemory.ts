/**
 * src/providers/mymemory.ts — MyMemory translation adapter.
 * Free REST API. 5k words/day anonymous; 50k words/day with a registered email.
 * Docs: https://mymemory.translated.net/doc/spec.php
 */

import { TranslationProvider, ProviderError } from "./types";

/** Strip region suffix: "fr-FR" → "fr", "pt-BR" → "pt" */
function toMyMemoryLocale(locale: string): string {
  return locale.split("-")[0].toLowerCase();
}

export class MyMemoryProvider implements TranslationProvider {
  readonly name = "mymemory";

  constructor(private readonly email: string = "") {}

  async translate(
    data: Record<string, string>,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    if (Object.keys(data).length === 0) return {};

    const source = toMyMemoryLocale(sourceLocale);
    const target = toMyMemoryLocale(targetLocale);
    const result: Record<string, string> = {};

    // MyMemory translates one string at a time — sequential to respect rate limits
    for (const [key, value] of Object.entries(data)) {
      const params = new URLSearchParams({
        q: value,
        langpair: `${source}|${target}`,
      });
      if (this.email) params.set("de", this.email);

      let response: Response;
      try {
        response = await fetch(
          `https://api.mymemory.translated.net/get?${params}`,
        );
      } catch (err: unknown) {
        throw new ProviderError(
          "mymemory",
          err instanceof Error ? err.message : String(err),
        );
      }

      if (!response.ok) {
        throw new ProviderError(
          "mymemory",
          `HTTP ${response.status} for key "${key}"`,
        );
      }

      const json = (await response.json()) as {
        responseData: { translatedText: string };
        responseStatus: number;
      };

      if (json.responseStatus !== 200) {
        throw new ProviderError(
          "mymemory",
          `API error ${json.responseStatus} for key "${key}"`,
        );
      }

      result[key] = json.responseData.translatedText;
    }

    return result;
  }
}
