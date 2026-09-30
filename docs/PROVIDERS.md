# Translation Providers

i18n Autopilot doesn't lock you into a single translation service. Every run,
you pick a provider from the list, and the tool sends only the **missing keys**
for each target language to that provider — plus, if you choose, keys whose
English text changed since they were last translated.

There is no default — pick whichever service fits your budget, quality needs,
or existing accounts. You can switch providers between runs at any time.

---

## Choosing a Provider

When you run `npx i18n-autopilot`, you'll see:

```
? Translation provider:
  1) Lingo.dev
  2) Google Translate
  3) OpenAI (GPT-4o)
  4) Claude (Anthropic)
  5) AWS Translate
  6) LibreTranslate (free, self-hostable)
  7) MyMemory (free, 5k words/day)
  8) Custom (provide your own JS file)
```

Type the number of the provider you want and press Enter.

| Provider | CLI value | What you need | Cost |
|----------|-----------|---------------|------|
| [Lingo.dev](#lingodev) | `lingo` | API key + Lingo.dev CLI (auto-install offered) | Free tier + paid plans |
| [Google Translate](#google-translate) | `google` | Cloud Translation API key | Usage-based (Google Cloud billing) |
| [OpenAI](#openai) | `openai` | OpenAI API key | Usage-based |
| [Claude](#claude-anthropic) | `claude` | Anthropic API key | Usage-based |
| [AWS Translate](#aws-translate) | `aws` | Access key ID, secret, region | Usage-based (AWS account) |
| [LibreTranslate](#libretranslate) | `libretranslate` | Instance URL, optional API key | Free if self-hosted |
| [MyMemory](#mymemory) | `mymemory` | Nothing (email optional) | Free, daily word limit |
| [Custom](#custom-provider--bring-your-own-ai) | `custom` | A local JS file | Whatever your service costs (a local model is free) |

---

## How Credentials Are Stored

The first time you use a provider, the CLI asks for its credentials and saves
them in `~/.i18n-autopilot/config.json` (outside your project, `0600`
permissions — owner-only read/write). Later runs reuse them without asking.

Credentials are stored **per provider**, so switching providers never loses a
key you saved earlier:

```json
{
  "providers": {
    "openai": { "apiKey": "..." },
    "aws": { "accessKeyId": "...", "secretAccessKey": "...", "region": "us-east-1" },
    "mymemory": { "email": "" }
  }
}
```

**Change a key:** remove that provider's entry from `config.json` (or edit it
directly) and run the tool again — you'll be prompted for new credentials.
Deleting the whole file resets every provider:

```bash
rm ~/.i18n-autopilot/config.json
```

**Upgrading from v1.0.x:** the old flat `{ "apiKey": "..." }` format is migrated
automatically to `providers.lingo` on the next run.

---

## General Notes

- **Only missing keys are sent — unless the English changed.** Each locale file
  is compared with `en.json` by key, and missing keys are translated. If the
  English text of an already-translated key has changed since it was last
  translated, the CLI asks once whether to re-translate those keys too (see
  [Updating Existing Translations](./USAGE.md#updating-existing-translations)).
  See [How It Works](./HOW_IT_WORKS.md#step-5-translation).
- **Source language is always English** (`en`).
- **Locale support varies by provider.** Not every service supports every
  target (for example, Hausa `ha`). If a provider fails for one locale, the
  error is logged and the run continues with the next locale.
- **Dry run makes no translation calls.** `--dry-run` reports, per locale, how
  many new keys *would* be translated and how many changed keys it would ask
  about.

---

## Lingo.dev

AI-powered localization platform with brand voice, glossary, and translation
memory configured in its dashboard.

**You'll need:** a Lingo.dev API key — see the
[Lingo.dev Setup Guide](./LINGO_SETUP.md) for account creation and dashboard
settings.

**Prompt:**
```
? Lingo.dev API key: ••••••••••••••••••••
```

**How it runs:** i18n Autopilot shells out to the Lingo.dev CLI (`lingo run`)
inside a temporary directory, one locale at a time. If the CLI isn't installed,
you'll be asked:

```
? Lingo.dev CLI is not installed. Install it now? (npm install -g lingo.dev)
```

---

## Google Translate

Google Cloud Translation (v2 / Basic) with broad language coverage.

**You'll need:** a Google Cloud project with the **Cloud Translation API**
enabled and billing set up, then an API key:

1. Open the [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs & Services** → **Library** → enable **Cloud Translation API**
3. **APIs & Services** → **Credentials** → **Create credentials** → **API key**
4. (Recommended) Restrict the key to the Cloud Translation API

**Prompt:**
```
? Google Cloud Translation API key: ••••••••••••••••••••
```

All missing keys for a locale are sent in a single request.

---

## OpenAI

LLM-based translation using `gpt-4o`, good at keeping tone and context.

**You'll need:** an API key from
[platform.openai.com/api-keys](https://platform.openai.com/api-keys) with
billing enabled.

**Prompt:**
```
? OpenAI API key: ••••••••••••••••••••
```

**How it runs:** the whole key→value map for a locale is sent as one JSON
object, and the model is asked to return JSON with the same keys. The response
is validated — if any key is missing or an unexpected key is added, that locale
fails with a `Response key mismatch` error instead of writing partial output.

---

## Claude (Anthropic)

LLM-based translation using Anthropic's `claude-opus-5` model, via the
official `@anthropic-ai/sdk`.

**You'll need:** an API key from the
[Anthropic Console](https://console.anthropic.com/) with billing enabled.

**Prompt:**
```
? Anthropic API key: ••••••••••••••••••••
```

**How it runs:** strings are sent in batches of 50 keys. Each request uses
structured outputs — a JSON schema listing exactly that batch's keys — so the
response is always valid JSON containing every key. Each batch allows up to
16,000 output tokens, runs at low effort, and has Anthropic's server-side
refusal fallbacks enabled (`fallbacks: "default"`).

If a batch is still truncated or declined, that locale fails with a clear
`[claude]` error and nothing is written for it; the other locales continue.

---

## AWS Translate

Amazon Translate via the AWS SDK — convenient if your team is already on AWS.

**You'll need:** an IAM user (or access key) with permission for
`translate:TranslateText`, and its access key ID and secret.

**Prompts:**
```
? AWS Access Key ID: AKIA...
? AWS Secret Access Key: ••••••••••••••••••••
? AWS Region: (us-east-1)
```

Press Enter at the region prompt to use `us-east-1`.

**Locale handling:** region suffixes are stripped (`pt-BR` → `pt`, `fr-FR` →
`fr`); Chinese codes are kept as-is. Strings are translated individually, in
parallel.

---

## LibreTranslate

Open-source translation engine that you can
[self-host](https://github.com/LibreTranslate/LibreTranslate) for free.

**You'll need:** the URL of a LibreTranslate instance, and an API key if that
instance requires one. The hosted instance at `libretranslate.com` may require
a key — check their site. A self-hosted instance (e.g. `http://localhost:5000`)
usually needs none.

**Prompts:**
```
? LibreTranslate instance URL (press Enter for public instance): (https://libretranslate.com)
? LibreTranslate API key (press Enter to skip for public instance): ••••
```

**Locale handling:** region suffixes are stripped (`pt-BR` → `pt`, `zh-CN` →
`zh`). Strings are translated one at a time, sequentially, to respect rate
limits — expect large batches to take a while.

---

## MyMemory

Free translation API — no account or key required.

**You'll need:** nothing. Optionally provide an email address to raise the
daily limit from **5,000** to **50,000 words/day**.

**Prompt:**
```
? Your email for MyMemory (optional, raises daily limit to 50k words):
```

Press Enter to skip.

**Locale handling:** region suffixes are stripped (`pt-BR` → `pt`). Strings are
translated one at a time, sequentially.

---

## Custom Provider / Bring Your Own AI

Want to use a local model, an internal translation service, a different LLM
vendor, or your own prompt? Write a small JS file and point the CLI at it.

```
? Translation provider: Custom (provide your own JS file)
? Path to your custom provider JS file: ./my-provider.js
```

The path is resolved relative to the directory you run the command from. The
CLI asks for it on every run (it isn't saved). An empty path, or one where no
file exists, is rejected and you're asked again.

### The Contract

The file is loaded with `require()`. Its default export (or `module.exports`)
must be an object with:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Shown in logs, e.g. `Running translations via my-provider...` |
| `translate` | `(data, sourceLocale, targetLocale) => Promise<Record<string, string>>` | Translates one locale |

- `data` — `{ key: "English string", ... }` containing **only** the keys
  missing from the target locale file (plus any changed keys you chose to
  re-translate)
- `sourceLocale` — always `"en"`
- `targetLocale` — one of `es`, `fr-FR`, `de-DE`, `ja-JP`, `ha`, `pt-BR`,
  `zh-CN`, `ar-SA`
- **Return** an object with the **same keys** and translated values

This matches the `TranslationProvider` interface in
[`src/providers/types.ts`](../src/providers/types.ts).

**Rules:**
- Return `{}` immediately when `data` is empty (no API call needed)
- Return every input key — anything you return is merged into
  `locales/<targetLocale>.json`, so don't add extra keys
- Throw an `Error` with a descriptive message on failure — the CLI logs it and
  moves on to the next locale
- Use plain CommonJS (`module.exports`, `require`). If your project's
  `package.json` has `"type": "module"`, name the file with a `.cjs` extension
- Keep secrets in environment variables your file reads, not hard-coded in it
- Node 22+ provides a global `fetch`, so no dependencies are needed for HTTP

### Example: Local AI with Ollama

This provider translates with a model running on your own machine via
[Ollama](https://ollama.com) — free, private, and no API key. It batches keys
into chunks, asks for JSON output, and verifies every key came back.

```bash
ollama pull llama3.1
ollama serve   # if it isn't already running
```

```js
// ollama-provider.js
// Bring-your-own-AI provider for i18n Autopilot using a local Ollama server.

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "llama3.1"; // any model you've pulled with `ollama pull`
const CHUNK_SIZE = 40; // keys per request — keeps prompts and responses small

const LANGUAGE_NAMES = {
  es: "Spanish",
  "fr-FR": "French (France)",
  "de-DE": "German (Germany)",
  "ja-JP": "Japanese",
  ha: "Hausa",
  "pt-BR": "Portuguese (Brazil)",
  "zh-CN": "Simplified Chinese",
  "ar-SA": "Arabic (Saudi Arabia)",
};

async function translateChunk(chunk, sourceLocale, targetLocale) {
  const target = LANGUAGE_NAMES[targetLocale] || targetLocale;

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        {
          role: "system",
          content:
            `You translate mobile app UI strings from ${sourceLocale} to ${target}. ` +
            `You receive a JSON object. Return ONLY a JSON object with exactly the ` +
            `same keys and the translated strings as values. Keep placeholders like ` +
            `{{name}} and punctuation intact. Do not translate the keys.`,
        },
        { role: "user", content: JSON.stringify(chunk) },
      ],
    }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`Ollama HTTP ${response.status}: ${body}`);
  }

  const json = await response.json();
  const raw = (json.message && json.message.content) || "";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Model did not return valid JSON: ${raw.slice(0, 200)}`);
  }

  // Verify every key came back as a string, and keep only the keys we sent.
  const result = {};
  const missing = [];
  for (const key of Object.keys(chunk)) {
    if (typeof parsed[key] === "string" && parsed[key].trim() !== "") {
      result[key] = parsed[key];
    } else {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Response missing keys: ${missing.join(", ")}`);
  }

  return result;
}

module.exports = {
  name: "ollama",

  async translate(data, sourceLocale, targetLocale) {
    const keys = Object.keys(data);
    if (keys.length === 0) return {};

    const result = {};
    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      const chunk = {};
      for (const key of keys.slice(i, i + CHUNK_SIZE)) chunk[key] = data[key];
      Object.assign(result, await translateChunk(chunk, sourceLocale, targetLocale));
    }
    return result;
  },
};
```

Then run:

```bash
npx i18n-autopilot
# ? Translation provider: Custom (provide your own JS file)
# ? Path to your custom provider JS file: ./ollama-provider.js
```

### Adapting It to Any OpenAI-Compatible API

Many services and local servers (LM Studio, vLLM, OpenRouter, Groq, Azure
OpenAI, and others) expose an OpenAI-compatible Chat Completions endpoint. To
use one, change `translateChunk`'s request and response handling:

```js
const API_URL = "https://your-endpoint.example.com/v1/chat/completions";
const MODEL = "your-model-name";
const API_KEY = process.env.MY_TRANSLATION_API_KEY; // read by your file, not by i18n Autopilot

// inside translateChunk:
const response = await fetch(API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  },
  body: JSON.stringify({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" }, // omit if your endpoint doesn't support it
    messages: [/* same system + user messages as above */],
  }),
});
// ...
const json = await response.json();
const raw = json.choices?.[0]?.message?.content || "";
```

Everything else — chunking, JSON parsing, and key verification — stays the
same.

### Testing Your Provider

- Run with `--dry-run` first. The CLI loads and validates your file (it must
  export a string `name` and a `translate` function) without calling
  `translate`.
- Then select a single target language for a real run and review the
  generated `locales/<locale>.json`.

---

## Next Steps

- [Usage Guide](./USAGE.md) — Workflows and best practices
- [How It Works](./HOW_IT_WORKS.md) — The pipeline and provider abstraction
- [Lingo.dev Setup](./LINGO_SETUP.md) — Lingo.dev account and dashboard settings
- [FAQ](./FAQ.md) — Common questions
