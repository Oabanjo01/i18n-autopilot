# Frequently Asked Questions

---

## General

### What does i18n Autopilot do?

It automatically internationalizes your React Native app by:
1. Finding all hardcoded strings
2. Replacing them with translation keys
3. Generating translation files for multiple languages

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

### How do I get a Lingo.dev API key?

See the [Lingo.dev Setup Guide](./LINGO_SETUP.md).

### Where is my API key stored?

In `~/.i18n-autopilot/config.json` (outside your project) with `0o600` permissions (owner-only read/write).

### Can I use a different translation service?

Currently only Lingo.dev is supported. Other providers may be added in future releases.

### What if I don't want to use Lingo.dev?

You can run with `--dry-run` to generate `en.json` and rewrite your code, then manually translate the JSON files.

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

Yes:
```tsx
const [message, setMessage] = useState("Loading..."); // ✅ Extracted
```

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

1. Tool sends `en.json` to Lingo.dev API
2. Lingo.dev translates using AI + brand voice + glossary
3. Tool saves translated files (`es.json`, `fr-FR.json`, etc.)

### What languages are supported?

Spanish (es), French (fr-FR), German (de-DE), Japanese (ja-JP), Portuguese (pt-BR), Chinese Simplified (zh-CN), Arabic (ar-SA)

### Can I add more languages later?

Yes! Just run the tool again and select additional languages.

### How much do translations cost?

See [Lingo.dev pricing](https://lingo.dev/pricing). i18n Autopilot only translates **new/missing keys** to save costs.

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

### "Lingo.dev CLI not found"

Install it:
```bash
npm install -g lingo.dev
```

Or let the tool install it automatically when prompted.

### "Invalid API key"

1. Check your key at [lingo.dev/settings](https://lingo.dev/settings)
2. Delete `~/.i18n-autopilot/config.json`
3. Run tool again and enter correct key

### Strings not being extracted

Make sure they're in supported patterns:
```tsx
<Text>Hello</Text>                 ✅ Extracted
<Text>{'Hello'}</Text>             ✅ Extracted
<Text>{someVariable}</Text>        ❌ Skipped (dynamic)
```

### Does it work with class components?

**No, only function components are supported.** The tool injects the `useTranslation()` hook, which only works in function components.

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

Translation API calls. Even if no code changes, translation still runs for selected languages.

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

- [Lingo.dev](https://lingo.dev) — AI-powered localization platform
- [react-i18next](https://react.i18next.com) — i18n runtime for React Native
- [Documentation](./docs/) — Full guides and API reference

---

## Support

**Questions?** Email [banjolakunri@gmail.com](mailto:banjolakunri@gmail.com)  
**Bug reports?** Open an issue on [GitHub](https://github.com/Oabanjo01/i18n-autopilot)  
**Using in production?** Let us know! We'd love to hear about it.

---

**Built by a developer tired of manually internationalizing apps.**

**Still have questions?** Open an issue on GitHub.