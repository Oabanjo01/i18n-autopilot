/**
 * src/providers/deepl.ts — DeepL translation adapter.
 * Uses the DeepL free API (api-free.deepl.com) via native fetch (Node ≥ 18).
 */

import { TranslationProvider, ProviderError } from "./types";

// ---------------------------------------------------------------------------
// Locale normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Convert a BCP-47 locale code to the format DeepL expects.
 *
 * Rules:
 *  - "pt-BR" → "PT-BR"  (DeepL supports this regional variant explicitly)
 *  - "zh-CN" / "zh"     → "ZH"
 *  - "fr-FR" / "fr"     → "FR"  (strip region, uppercase)
 *  - All others: uppercase language tag only
 */
function toDeepLLocale(locale: string): string {
  const lower = locale.toLowerCase();

  if (lower === "pt-br") return "PT-BR";
  if (lower.startsWith("zh")) return "ZH";

  // Use only the primary language subtag, uppercased
  return locale.split("-")[0].toUpperCase();
}

// ---------------------------------------------------------------------------
// DeepL provider
// ---------------------------------------------------------------------------

export class DeepLProvider implements TranslationProvider {
  readonly name = "deepl";

  constructor(private readonly apiKey: string) {}

  async translate(
    data: Record<string, string>,
    _sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    if (Object.keys(data).length === 0) return {};

    const keys = Object.keys(data);
    const texts = keys.map((k) => data[k]);

    const body = JSON.stringify({
      text: texts,
      target_lang: toDeepLLocale(targetLocale),
    });

    let response: Response;
    try {
      response = await fetch("https://api-free.deepl.com/v2/translate", {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });
    } catch (err: unknown) {
      throw new ProviderError(
        "deepl",
        err instanceof Error ? err.message : String(err),
      );
    }

    if (!response.ok) {
      const bodyExcerpt = (await response.text()).slice(0, 200);
      throw new ProviderError(
        "deepl",
        `HTTP ${response.status}: ${bodyExcerpt}`,
      );
    }

    const json = (await response.json()) as {
      translations: Array<{ text: string }>;
    };

    const result: Record<string, string> = {};
    for (let i = 0; i < keys.length; i++) {
      result[keys[i]] = json.translations[i].text;
    }
    return result;
  }
}
