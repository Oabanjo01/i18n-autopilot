# Frequently Asked Questions

---

## General

### What does i18n Autopilot do?

It automatically internationalizes your React Native app by:
1. Finding all hardcoded strings
2. Replacing them with translation keys
3. Generating translation files for multiple languages, using the translation provider you choose

### Is it safe to run on my production codebase?

Yes, but we recommend:
1. Commit your code first
2. Run with `--dry-run` to preview changes
3. Review diffs before committing

### Does it work with Expo?

Yes! Works with both Expo and bare React Native projects.

### What about TypeScript?

Fully supported. The tool parses `.tsx` files using Babel.

---

## Setup & Configuration

### Which translation providers are supported?

You pick one at the provider prompt on every run — there is no default:

- **Lingo.dev** — AI localization platform with brand voice, glossary, and translation memory
- **Google Translate** — Cloud Translation API, broad language coverage
- **OpenAI** — GPT-4o, context-aware translations
- **Claude (Anthropic)** — LLM-based, context-aware translations
- **AWS Translate** — convenient for teams already on AWS
- **LibreTranslate** — open source, free to self-host
- **MyMemory** — free, no key required (daily word limit)
- **Custom** — point to any local JS file that implements the provider interface

See the [Providers Guide](./PROVIDERS.md) for setup steps and limitations.

### How do I get an API key?

It depends on the provider — the [Providers Guide](./PROVIDERS.md) covers each one. For Lingo.dev, see the [Lingo.dev Setup Guide](./LINGO_SETUP.md). MyMemory needs no key at all.

### Can I use a free provider?

Yes. **MyMemory** needs no account (5k words/day, or 50k with an email). **LibreTranslate** is free when you self-host it. Lingo.dev's free tier also works. A **custom** provider running a local model (e.g. Ollama) costs nothing per request.

### Where is my API key stored?

In `~/.i18n-autopilot/config.json` (outside your project) with `0o600` permissions (owner-only read/write). Credentials are saved separately for each provider, so switching providers doesn't overwrite a key you saved earlier.

### Can I switch providers?

Yes. Pick a different one on your next run. Existing translations are kept; only keys missing from each locale file (plus any changed English you choose to re-translate) are sent to the new provider.

### Can I use my own AI or translation service?

Yes — choose **Custom** and give the CLI the path to a JS file that exports a `name` and an async `translate(data, sourceLocale, targetLocale)` function. See [Custom Provider / Bring Your Own AI](./PROVIDERS.md#custom-provider--bring-your-own-ai) for the contract and a complete example using a local Ollama model.

---

## Usage

### What file types are supported?

- `.tsx` — TypeScript + JSX
- `.jsx` — JavaScript + JSX
- `.ts` — TypeScript (hooks only)
- `.js` — JavaScript (hooks only)

### What Text components are detected?

By default: `<Text>`

You can specify custom components:
```bash
? Custom Text components: ThemedText, AppText, StyledText
```

### Does it extract from useState hooks?

Yes, inside function components and custom hooks:
```tsx
const [message, setMessage] = useState("Loading..."); // ✅ Extracted
const [status, setStatus] = useState("idle");         // ⏭ Left alone
```

A single lowercase word (`"idle"`, `"loading"`, `"dark"`) is treated as a state
value your code compares against, not display text, so it isn't translated —
translating it would break checks like `status === "idle"`.

### What about TextInput placeholders?

Not yet supported. Coming in a future release.

### Can I exclude certain files?

Add them to these auto-excluded directories:
- `node_modules/`
- `__tests__/`
- `android/`
- `ios/`

Or prefix filename with a dot (`.IgnoreMe.tsx`).

---

## Translations

### How does translation work?

1. For each target language, the tool compares `en.json` with that locale's file and collects the missing keys
2. If any already-translated keys have changed English since they were last translated, it asks once whether to re-translate them too
3. It sends only those keys to the provider you selected
4. It merges the results into `locales/es.json`, `locales/fr-FR.json`, etc.

See [How It Works](./HOW_IT_WORKS.md#step-5-translation) for details.

### What languages are supported?

Spanish (es), French (fr-FR), German (de-DE), Japanese (ja-JP), Hausa (ha), Portuguese (pt-BR), Chinese Simplified (zh-CN), Arabic (ar-SA)

Not every provider supports every language — check your provider's language list. If one locale fails, the others still complete.

### Can I add more languages later?

Yes! Just run the tool again and select additional languages.

### How much do translations cost?

It depends on the provider you choose — each has its own pricing (some are free; see the [Providers Guide](./PROVIDERS.md)). i18n Autopilot itself is free, and it only translates **new/missing keys** to keep costs down — changed English is re-translated only if you say yes at the prompt.

### If I change English text in `en.json`, is it re-translated?

You're asked. The tool records the English each translation was made from (in `i18n-autopilot.sources.json` — commit it so your team shares this), and on the next run it asks once: "N English string(s) changed since they were last translated. Re-translate them?" **Yes** (default) re-translates them; **No** keeps the existing translations and asks again next run. Keys translated before upgrading to this version are baselined on the first run, so earlier edits aren't detected — delete such a key from the target locale files to force it. See [Updating Existing Translations](./USAGE.md#updating-existing-translations).

### Can I edit translations manually?

Yes, edit `locales/{locale}.json` files directly. The tool preserves manual edits.

---

## Behavior

### What happens on the second run?

The tool uses content hashing to detect:
- New files → processes them
- Modified files → re-processes them
- Unchanged files → skips them

### Will it overwrite my manual changes?

**To `en.json`:** Yes, if new strings are found. Don't manually edit `en.json`.

**To other locale files (es.json, etc.):** No, the tool merges new keys and preserves existing translations.

### Can I run it multiple times safely?

Yes, it's idempotent. Running multiple times is safe and fast (only processes changes).

### How do I reset everything?
```bash
rm -rf .i18n-autopilot.json locales/
npx i18n-autopilot
```

---

## Troubleshooting

### Tool hangs after "Translations complete"

Update to latest version:
```bash
npx i18n-autopilot@latest
```

### Empty `en.json` after running

Fixed in v1.0.0. Update to latest version.

### "Lingo.dev CLI not found" (Lingo.dev provider)

Install it:
```bash
npm install -g lingo.dev
```

Or let the tool install it automatically when prompted.

### "Invalid API key"

1. Check or regenerate the key in your provider's dashboard
2. Remove that provider's entry under `providers` in `~/.i18n-autopilot/config.json` (or delete the file to reset all providers)
3. Run the tool again and enter the correct key

### "Response key mismatch" / "Failed to parse model response as JSON"

The AI provider (OpenAI or your custom provider) returned output that wasn't valid JSON or didn't contain every key. Nothing is written for that locale. Run again, or (for a custom provider) translate in smaller chunks.

Claude uses structured outputs, so its responses are always valid JSON with every key. If a Claude batch is truncated or the request is declined, that locale fails with a `[claude]` error instead; run again.

### Strings not being extracted

Make sure they're in supported patterns:
```tsx
<Text>Hello</Text>                 ✅ Extracted
<Text>{'Hello'}</Text>             ✅ Extracted
<Text>{someVariable}</Text>        ❌ Skipped (dynamic)
```

### Does it work with class components?

**No, only function components are supported.** The tool injects the `useTranslation()` hook, which only works in function components. Class components are skipped entirely — their strings aren't extracted and the file is left untouched, so it keeps compiling.

If your codebase uses class components, you'll need to:
1. Convert them to function components (like a modern human), OR
2. Manually wrap them with the `withTranslation` HOC

**Example of manual conversion:**
```tsx
// Your class component (not auto-rewritten)
import { withTranslation } from 'react-i18next';

class Home extends React.Component {
  render() {
    return <Text>{this.props.t('welcome')}</Text>;
  }
}

export default withTranslation()(Home);
```

Class component support won't be added to the core tool, but you're welcome to fork the repo and implement it. Pull requests are always appreciated!

---

### What React Native patterns are supported?

✅ **Supported:**
- Function components
- Arrow function components  
- Custom hooks with `useState("string")`
- Custom Text components (when specified)

❌ **Not Supported:**
- Class components (requires manual `withTranslation` HOC)
- `TextInput` placeholders (coming soon)
- Dynamic strings/variables
- String concatenation

### Wrong keys being generated

Keys are auto-generated from string content. Example:
```
"Welcome to our app!" → welcome_app
```

To customize, edit `en.json` after first run (but key references in code will mismatch).

### Where are logs saved?
```bash
cat ~/.i18n-autopilot/run.log
```

---

## Performance

### How long does it take?

- Small project (20 files): ~10 seconds
- Medium project (100 files): ~30 seconds
- Large project (500 files): ~2 minutes

Bottleneck is translation API calls (network-bound).

### Why is the second run slow?

Usually it isn't — locales that already have every key are skipped. If a run is slow, it's translating missing keys; providers that translate one string per request (LibreTranslate, MyMemory) take longer on large batches.

### Can I skip translation?

Not currently. Future releases may add `--skip-translate` flag.

---

## Integration

### Does it work with existing i18next setups?

Partially. It will:
- Add new keys to existing `en.json`
- Generate new locale files

But it won't:
- Modify existing i18next config
- Handle custom namespace structures

### Can I use it with React Navigation?

Yes, but navigation screen titles need manual translation:
```tsx
<Stack.Screen 
  name="Home" 
  options={{ title: t('home_title') }} // Manual
/>
```

### Does it integrate with CI/CD?

Not yet. Planned for future release:
- GitHub Actions workflow generation
- Auto-translate on `en.json` changes

---

## Contributing

### Can I contribute?

Yes! Open an issue or PR on GitHub.

### What features are planned?

- TextInput placeholder extraction
- Pluralization support
- Context-aware translations
- CI/CD workflow generation
- More i18n library support (i18n-js, lingui) - hopefully, lol

---

## Support

### Where do I get help?

1. Check this FAQ
2. Read [Usage Guide](./USAGE.md)
3. Open an issue on GitHub

### How do I report bugs?

Open an issue with:
- Tool version (`npx i18n-autopilot --version`)
- Node.js version (`node --version`)
- Error message
- Steps to reproduce

---

## Links

- [Providers Guide](./PROVIDERS.md) — All supported translation providers
- [Lingo.dev Setup](./LINGO_SETUP.md) — Lingo.dev account and dashboard settings
- [react-i18next](https://react.i18next.com) — i18n runtime for React Native
- [Usage Guide](./USAGE.md) and [How It Works](./HOW_IT_WORKS.md) — Full guides

---

## Support

**Questions?** Email [banjolakunri@gmail.com](mailto:banjolakunri@gmail.com)  
**Bug reports?** Open an issue on [GitHub](https://github.com/Oabanjo01/i18n-autopilot)  
**Using in production?** Let us know! We'd love to hear about it.

---

**Built by a developer tired of manually internationalizing apps.**

**Still have questions?** Open an issue on GitHub.
