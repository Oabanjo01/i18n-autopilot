# Custom Translation Providers

i18n Autopilot supports any translation service through the **custom provider** path. If your preferred service isn't in the built-in list, you can write a small JS file and point the CLI to it.

---

## How It Works

When you select **Custom** at the provider prompt, the CLI asks for a path to a local JS file:

```
? Translation provider: Custom
? Path to your custom provider JS file: ./my-provider.js
```

The file must export an object with two fields:

```js
module.exports = {
  // Unique name shown in logs
  name: "my-provider",

  // Receives the missing keys and returns translated values
  async translate(data, sourceLocale, targetLocale) {
    // data: { key: "English string", ... }
    // sourceLocale: always "en"
    // targetLocale: e.g. "es", "fr-FR"
    // return: { key: "translated string", ... } — same keys as input
  },
};
```

**Rules:**
- Return the **same keys** as the input `data` object
- Return `{}` immediately if `data` is empty (no API call needed)
- Throw an `Error` with a descriptive message on failure
- Store your API keys in environment variables, not in the file

---

## Built-in Examples

Ready-to-use provider files are in the `examples/` directory:

| File | Service | Cost | API Key Required |
|------|---------|------|-----------------|
| `examples/claude-provider.js` | Anthropic Claude | Paid (free tier available) | Yes — `ANTHROPIC_API_KEY` |
| `examples/libretranslate-provider.js` | LibreTranslate | Free (public instance) | No (optional for self-hosted) |
| `examples/mymemory-provider.js` | MyMemory | Free (5k words/day) | No (optional for higher limits) |

---

## Claude (Anthropic)

**Requirements:** `npm install @anthropic-ai/sdk`

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx i18n-autopilot
# ? Translation provider: Custom
# ? Path to your custom provider JS file: ./examples/claude-provider.js
```

Uses `claude-opus-4-5` by default. Edit the file to switch models.

---

## LibreTranslate (Free, Open Source)

No API key needed for the public instance. Rate limited.

```bash
npx i18n-autopilot
# ? Translation provider: Custom
# ? Path to your custom provider JS file: ./examples/libretranslate-provider.js
```

**Self-hosted instance:**
```bash
export LIBRETRANSLATE_URL=http://localhost:5000
export LIBRETRANSLATE_API_KEY=your-key  # if your instance requires one
```

---

## MyMemory (Free, No Key)

5,000 words/day free. Set your email for 10,000 words/day.

```bash
export MYMEMORY_EMAIL=you@example.com  # optional, increases limit
npx i18n-autopilot
# ? Translation provider: Custom
# ? Path to your custom provider JS file: ./examples/mymemory-provider.js
```

---

## Writing Your Own Provider

Here's a minimal template:

```js
// my-locize-provider.js
const { Locize } = require("locize");

const client = new Locize({
  apiKey: process.env.LOCIZE_API_KEY,
  projectId: process.env.LOCIZE_PROJECT_ID,
});

module.exports = {
  name: "locize",

  async translate(data, sourceLocale, targetLocale) {
    if (Object.keys(data).length === 0) return {};

    const result = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = await client.translate(value, sourceLocale, targetLocale);
    }
    return result;
  },
};
```

**Tips:**
- Batch requests where possible (one API call for all keys is faster than one per key)
- Use `Promise.all` for parallel requests when the API supports it
- Include the provider name in error messages for easier debugging
- Test with `--dry-run` first to confirm the file loads correctly

---

## Sharing Providers

If you build a provider for a popular service, consider contributing it to the `examples/` directory via a pull request. See [Contributing](../readme.md) for details.
