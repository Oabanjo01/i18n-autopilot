# Lingo.dev Setup Guide

[Lingo.dev](https://lingo.dev) is one of the translation providers you can choose in i18n Autopilot. It offers AI-powered translations with brand voice, glossary, and translation memory. This guide covers setting it up.

Using a different service? See the [Providers Guide](./PROVIDERS.md) for every supported option, including how to bring your own AI.

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

Run `npx i18n-autopilot` and choose **Lingo.dev** at the provider prompt:
```
? Translation provider: 1) Lingo.dev
? Lingo.dev API key: ••••••••••••••••••••
```

Paste your key and press Enter. It's saved locally under the `lingo` entry in `~/.i18n-autopilot/config.json` and reused whenever you pick Lingo.dev again.

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

**How it's used:** for each target language, i18n Autopilot writes the keys to translate to a temporary directory, runs `lingo run --target-locale <locale>` there with your key, then merges the output into your project's `locales/<locale>.json`. The temporary directory is deleted afterwards — no Lingo.dev config files are left in your project.

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
Remove the `lingo` entry under `providers` in `~/.i18n-autopilot/config.json` and run the tool again. (Deleting the whole file also works, but clears saved credentials for every provider.)

---

## Security Best Practices

✅ **DO:** Let the tool store your API key in `~/.i18n-autopilot/config.json` (it does this automatically)  
✅ **DO:** Add `.i18n-autopilot.json` to `.gitignore`  
❌ **DON'T:** Commit API keys to version control  
❌ **DON'T:** Share API keys in screenshots or logs  

---

## Next Steps

- [Providers Guide](./PROVIDERS.md) — Compare and set up other providers
- [How It Works](./HOW_IT_WORKS.md) — Understand the translation pipeline
- [Usage Guide](./USAGE.md) — Learn workflows and best practices
- [FAQ](./FAQ.md) — Common questions

---

**Need help?** Contact Lingo.dev support or open an issue on GitHub.