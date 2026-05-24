/**
 * LibreTranslate custom translation provider for i18n Autopilot.
 *
 * LibreTranslate is a free, open-source translation API.
 * Public instance: https://libretranslate.com (rate limited, no key required for basic use)
 * Self-host: https://github.com/LibreTranslate/LibreTranslate
 *
 * No dependencies required — uses native fetch (Node >= 18).
 *
 * Usage:
 *   npx i18n-autopilot
 *   ? Translation provider: Custom
 *   ? Path to your custom provider JS file: ./examples/libretranslate-provider.js
 *
 * Optional: set LIBRETRANSLATE_URL to use a self-hosted instance.
 * Optional: set LIBRETRANSLATE_API_KEY if your instance requires one.
 */

const BASE_URL = process.env.LIBRETRANSLATE_URL || "https://libretranslate.com";
const API_KEY = process.env.LIBRETRANSLATE_API_KEY || "";

/**
 * LibreTranslate uses ISO 639-1 language codes (e.g. "en", "es", "fr").
 * Strip region suffixes: "fr-FR" → "fr", "pt-BR" → "pt", "zh-CN" → "zh".
 */
function toLibreLocale(locale) {
  return locale.split("-")[0].toLowerCase();
}

module.exports = {
  name: "libretranslate",

  async translate(data, sourceLocale, targetLocale) {
    if (Object.keys(data).length === 0) return {};

    const source = toLibreLocale(sourceLocale);
    const target = toLibreLocale(targetLocale);
    const keys = Object.keys(data);
    const result = {};

    // LibreTranslate translates one string at a time — run sequentially
    // to stay within public rate limits.
    for (const key of keys) {
      const body = JSON.stringify({
        q: data[key],
        source,
        target,
        format: "text",
        ...(API_KEY ? { api_key: API_KEY } : {}),
      });

      const response = await fetch(`${BASE_URL}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        const excerpt = (await response.text()).slice(0, 200);
        throw new Error(
          `[libretranslate] HTTP ${response.status} for key "${key}": ${excerpt}`,
        );
      }

      const json = await response.json();
      result[key] = json.translatedText;
    }

    return result;
  },
};
