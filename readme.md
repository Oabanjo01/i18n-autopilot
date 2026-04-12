# Lingo.dev Setup Guide

i18n Autopilot uses [Lingo.dev](https://lingo.dev) for AI-powered
translations. This guide covers setup and the current behavior of deep
container-based extraction so teams know what to expect before running the
package.

## Deep Analysis Update

The latest `--deep` update makes two important changes:

- Module-scope arrays, objects, and Maps are rewritten as functions that
  receive `t`, which keeps the generated code compatible with React hooks.
- Deep analysis now follows rendered user-facing values instead of rewriting
  every string found in a container.

In practice, visible labels and messages are translated, while structural
values such as routes, paths, IDs, and JSX keys are left untouched.

This update lays the groundwork for broader user-facing extraction while
keeping rewrites safe and reviewable.

---

## Important Notes

⚠️ **Function Components Only** — Currently supports React function components and hooks. Class components are not supported (they require the `withTranslation` HOC instead of the `useTranslation` hook).

⚠️ **File Modification** — This tool rewrites your source files. Always commit your code before running, or use `--dry-run` to preview changes first.

⚠️ **Custom Text Components** — If your app uses custom Text wrappers (e.g., `ThemedText`, `AppText`), specify them when prompted. Otherwise, those strings won't be extracted.

⚠️ **Deep Mode Scope** — `--deep` translates rendered container values. Unused
entries in arrays or objects are intentionally left unchanged until they are
actually rendered.

---

## 1. Create a Lingo.dev Account

1. Go to [lingo.dev](https://lingo.dev)
2. Click **Sign Up** (free tier available)
3. Verify your email

---

## 2. Get Your API Key

1. Log in to your Lingo.dev dashboard
2. Navigate to **Settings** → **API Keys**
3. Click **Create New API Key**
4. Copy the key (you'll only see it once)

**Security Note:** Never commit this key to your repository. i18n Autopilot stores it securely in `~/.i18n-autopilot/config.json` (outside your project).

---

## 3. First Run

When you run `npx i18n-autopilot` for the first time, you'll be prompted:
```
? Lingo.dev API key: ••••••••••••••••••••
```

Paste your key and press Enter. It's saved locally and reused for all future runs.

---

## 4. Configure Translation Settings (Optional)

After your first translation, you can configure advanced settings in the Lingo.dev dashboard:

### Brand Voice
Define your app's tone (formal, casual, technical, friendly)

### Glossary
Add product-specific terms that should never be translated  
Example: "App Store" → "App Store" (not "Tienda de Aplicaciones")

### Translation Memory
Lingo.dev remembers past translations for consistency

---

## 5. Lingo.dev CLI Installation

i18n Autopilot will automatically prompt to install the Lingo.dev CLI if it's not found:
```
? Lingo.dev CLI is not installed. Install it now? (npm install -g lingo.dev)
```

Say **Yes** to install globally, or install manually:
```bash
npm install -g lingo.dev
```

Verify installation:
```bash
lingo --version
```

---

## Pricing

Lingo.dev offers:
- **Free Tier** — Limited translations per month
- **Pro Tier** — Unlimited translations + advanced features
- **Enterprise** — Custom pricing for teams

Check current pricing at [lingo.dev/pricing](https://lingo.dev/pricing)

---

## Troubleshooting

### "Invalid API key" error
- Regenerate your key in the Lingo.dev dashboard
- Run `npx i18n-autopilot` again and enter the new key

### "Lingo.dev CLI not found"
```bash
npm install -g lingo.dev
```

### Change API key
Delete the config file and run the tool again:
```bash
rm ~/.i18n-autopilot/config.json
npx i18n-autopilot
```

---

## Security Best Practices

✅ **DO:** Store API key in `~/.i18n-autopilot/config.json` (tool does this automatically)  
✅ **DO:** Add `.i18n-autopilot.json` to `.gitignore`  
❌ **DON'T:** Commit API keys to version control  
❌ **DON'T:** Share API keys in screenshots or logs  

---

## Next Steps

- [How It Works](./docs/HOW_IT_WORKS.md) — Understand the translation pipeline
- [Usage Guide](.//docs/USAGE.md) — Learn workflows and best practices
- [FAQ](./docs/FAQ.md) — Common questions

---

[![npm version](https://badge.fury.io/js/i18n-autopilot.svg)](https://www.npmjs.com/package/i18n-autopilot)
[![npm downloads](https://img.shields.io/npm/dm/i18n-autopilot.svg)](https://www.npmjs.com/package/i18n-autopilot)

**Need help?** Contact Lingo.dev support or open an issue on GitHub.
