/**
 * src/providers/libretranslate.ts — LibreTranslate adapter.
 * Free, open-source translation API. No key required for the public instance.
 * Self-host: https://github.com/LibreTranslate/LibreTranslate
 */

import { TranslationProvider, ProviderError } from "./types";

/** Strip region suffix: "fr-FR" → "fr", "pt-BR" → "pt", "zh-CN" → "zh" */
function toLibreLocale(locale: string): string {
  return locale.split("-")[0].toLowerCase();
}

export class LibreTranslateProvider implements TranslationProvider {
  readonly name = "libretranslate";

  constructor(
    private readonly baseUrl: string = "https://libretranslate.com",
    private readonly apiKey: string = "",
  ) {}

  async translate(
    data: Record<string, string>,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    if (Object.keys(data).length === 0) return {};

    const source = toLibreLocale(sourceLocale);
    const target = toLibreLocale(targetLocale);
    const keys = Object.keys(data);
    const result: Record<string, string> = {};

    // LibreTranslate translates one string at a time — sequential to respect rate limits
    for (const key of keys) {
      const body: Record<string, string> = {
        q: data[key],
        source,
        target,
        format: "text",
      };
      if (this.apiKey) body.api_key = this.apiKey;

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err: unknown) {
        throw new ProviderError(
          "libretranslate",
          err instanceof Error ? err.message : String(err),
        );
      }

      if (!response.ok) {
        const excerpt = (await response.text()).slice(0, 200);
        throw new ProviderError(
          "libretranslate",
          `HTTP ${response.status} for key "${key}": ${excerpt}`,
        );
      }

      const json = (await response.json()) as { translatedText: string };
      result[key] = json.translatedText;
    }

    return result;
  }
}
