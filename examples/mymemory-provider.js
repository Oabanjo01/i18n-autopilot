/**
 * MyMemory custom translation provider for i18n Autopilot.
 *
 * MyMemory is a free public translation API — no API key required.
 * Free tier: 5,000 words/day (anonymous), 10,000 words/day (with email).
 * Docs: https://mymemory.translated.net/doc/spec.php
 *
 * No dependencies required — uses native fetch (Node >= 18).
 *
 * Usage:
 *   npx i18n-autopilot
 *   ? Translation provider: Custom
 *   ? Path to your custom provider JS file: ./examples/mymemory-provider.js
 *
 * Optional: set MYMEMORY_EMAIL to increase the daily limit to 10,000 words.
 */

const EMAIL = process.env.MYMEMORY_EMAIL || "";

/**
 * MyMemory uses "en|es", "en|fr-FR" style language pair codes.
 */
function toLangPair(sourceLocale, targetLocale) {
  return `${sourceLocale}|${targetLocale}`;
}

module.exports = {
  name: "mymemory",

  async translate(data, sourceLocale, targetLocale) {
    if (Object.keys(data).length === 0) return {};

    const langPair = toLangPair(sourceLocale, targetLocale);
    const keys = Object.keys(data);
    const result = {};

    // MyMemory translates one string at a time.
    for (const key of keys) {
      const params = new URLSearchParams({
        q: data[key],
        langpair: langPair,
        ...(EMAIL ? { de: EMAIL } : {}),
      });

      const response = await fetch(
        `https://api.mymemory.translated.net/get?${params}`,
      );

      if (!response.ok) {
        const excerpt = (await response.text()).slice(0, 200);
        throw new Error(
          `[mymemory] HTTP ${response.status} for key "${key}": ${excerpt}`,
        );
      }

      const json = await response.json();

      if (json.responseStatus !== 200) {
        throw new Error(
          `[mymemory] API error for key "${key}": ${json.responseDetails}`,
        );
      }

      result[key] = json.responseData.translatedText;
    }

    return result;
  },
};
