/**
 * Claude (Anthropic) custom translation provider for i18n Autopilot.
 *
 * Requirements:
 *   npm install @anthropic-ai/sdk
 *
 * Usage:
 *   Set ANTHROPIC_API_KEY in your environment, then run:
 *   npx i18n-autopilot
 *   ? Translation provider: Custom
 *   ? Path to your custom provider JS file: ./examples/claude-provider.js
 */

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = {
  name: "claude",

  async translate(data, sourceLocale, targetLocale) {
    if (Object.keys(data).length === 0) return {};

    const prompt =
      `Translate the following JSON object values from ${sourceLocale} to ${targetLocale}.\n` +
      `Return ONLY a valid JSON object with the same keys and translated values.\n` +
      `Do not add any explanation, markdown, or code fences.\n\n` +
      JSON.stringify(data, null, 2);

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0]?.text ?? "";

    let translated;
    try {
      translated = JSON.parse(raw);
    } catch {
      throw new Error(
        `[claude] Failed to parse response as JSON: ${raw.slice(0, 200)}`,
      );
    }

    // Validate key set matches input
    const inputKeys = Object.keys(data);
    const missingKeys = inputKeys.filter((k) => !(k in translated));
    if (missingKeys.length > 0) {
      throw new Error(
        `[claude] Response missing keys: ${missingKeys.join(", ")}`,
      );
    }

    return translated;
  },
};
